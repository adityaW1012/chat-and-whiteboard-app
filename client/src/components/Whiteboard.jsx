import { useRef, useEffect, useState } from 'react';

const BG_COLOR = '#1e1f22';

function cursorColorFromUsername(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 80%, 60%)`;
}

function getBoundingBox(action) {
  if (action.type === 'stroke') {
    const xs = action.points.map((p) => p.x);
    const ys = action.points.map((p) => p.y);
    const pad = action.size / 2 + 4;
    return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
  }
  if (action.type === 'shape') {
    if (action.shapeType === 'circle') {
      const radius = Math.hypot(action.x1 - action.x0, action.y1 - action.y0);
      return { minX: action.x0 - radius, minY: action.y0 - radius, maxX: action.x0 + radius, maxY: action.y0 + radius };
    }
    return {
      minX: Math.min(action.x0, action.x1),
      minY: Math.min(action.y0, action.y1),
      maxX: Math.max(action.x0, action.x1),
      maxY: Math.max(action.y0, action.y1),
    };
  }
  if (action.type === 'text') {
    const width = action.text.length * action.size * 2.2;
    const height = action.size * 4;
    return { minX: action.x, minY: action.y - height, maxX: action.x + width, maxY: action.y + height * 0.2 };
  }
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function pointInBox(point, box) {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

function translateAction(action, dx, dy) {
  if (action.type === 'stroke') {
    return { ...action, points: action.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  if (action.type === 'shape') {
    return { ...action, x0: action.x0 + dx, y0: action.y0 + dy, x1: action.x1 + dx, y1: action.y1 + dy };
  }
  if (action.type === 'text') {
    return { ...action, x: action.x + dx, y: action.y + dy };
  }
  return action;
}

function drawAction(ctx, action) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (action.type === 'stroke') {
    ctx.strokeStyle = action.mode === 'eraser' ? BG_COLOR : action.color;
    ctx.lineWidth = action.size;
    ctx.beginPath();
    action.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  } else if (action.type === 'shape') {
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = action.size;
    ctx.beginPath();
    if (action.shapeType === 'line') {
      ctx.moveTo(action.x0, action.y0);
      ctx.lineTo(action.x1, action.y1);
      ctx.stroke();
    } else if (action.shapeType === 'rect') {
      const w = action.x1 - action.x0;
      const h = action.y1 - action.y0;
      action.fill ? ctx.fillRect(action.x0, action.y0, w, h) : ctx.strokeRect(action.x0, action.y0, w, h);
    } else if (action.shapeType === 'circle') {
      const radius = Math.hypot(action.x1 - action.x0, action.y1 - action.y0);
      ctx.arc(action.x0, action.y0, radius, 0, Math.PI * 2);
      action.fill ? ctx.fill() : ctx.stroke();
    }
  } else if (action.type === 'text') {
    ctx.fillStyle = action.color;
    ctx.font = `${action.size * 4}px sans-serif`;
    ctx.fillText(action.text, action.x, action.y);
  }
}

function redrawAll(ctx, canvas, history, view) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
  history.forEach((action) => drawAction(ctx, action));
}

function Whiteboard({ conversationId, socket, username }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const wrapperRef = useRef(null);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#ffffff');
  const [size, setSize] = useState(3);
  const [fill, setFill] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);

  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const isDrawing = useRef(false);
  const isPanning = useRef(false);
  const spacePressed = useRef(false);
  const panStart = useRef(null);
  const startPoint = useRef(null);
  const currentStroke = useRef([]);
  const selectedIdRef = useRef(null);
  const dragOriginRef = useRef(null);
  const dragStartWorldRef = useRef(null);
  const remoteCursorRef = useRef(null);

  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const idCounter = useRef(0);
  const nextId = () => `${Date.now()}_${idCounter.current++}`;

  const myColor = useRef(cursorColorFromUsername(username));

  // World <-> screen coordinate conversion
  const toWorld = (screenX, screenY) => {
    const v = viewRef.current;
    return { x: (screenX - v.offsetX) / v.scale, y: (screenY - v.offsetY) / v.scale };
  };
  const toScreen = (worldX, worldY) => {
    const v = viewRef.current;
    return { x: worldX * v.scale + v.offsetX, y: worldY * v.scale + v.offsetY };
  };
  const getScreenPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const redrawBase = () => {
    redrawAll(canvasRef.current.getContext('2d'), canvasRef.current, historyRef.current, viewRef.current);
  };

  const redrawOverlay = (previewAction, selectionBox) => {
    const overlay = overlayRef.current;
    const ctx = overlay.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(viewRef.current.scale, 0, 0, viewRef.current.scale, viewRef.current.offsetX, viewRef.current.offsetY);

    if (previewAction) drawAction(ctx, previewAction);

    if (selectionBox) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const topLeft = toScreen(selectionBox.minX, selectionBox.minY);
      const bottomRight = toScreen(selectionBox.maxX, selectionBox.maxY);
      ctx.strokeStyle = '#5865f2';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      ctx.setLineDash([]);
    }

    if (remoteCursorRef.current) {
      const c = remoteCursorRef.current;
      const screenPos = toScreen(c.x, c.y);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '12px sans-serif';
      ctx.fillText(c.username, screenPos.x + 8, screenPos.y - 8);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      overlay.width = overlay.offsetWidth;
      overlay.height = overlay.offsetHeight;
      redrawBase();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    historyRef.current = [];
    redoRef.current = [];
    viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 };
    setZoomPct(100);
    redrawBase();
  }, [conversationId]);

  // Space bar for panning
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code === 'Space') spacePressed.current = true;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIdRef.current) {
          const id = selectedIdRef.current;
          historyRef.current = historyRef.current.filter((a) => a.id !== id);
          selectedIdRef.current = null;
          redrawBase();
          redrawOverlay(null, null);
          socket.emit('whiteboard_action_delete', { conversationId, actionId: id });
        }
      }
    };
    const onKeyUp = (e) => {
      if (e.code === 'Space') spacePressed.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [socket, conversationId]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleRemoteDraw = (data) => {
      const ctx = canvasRef.current.getContext('2d');
      ctx.setTransform(viewRef.current.scale, 0, 0, viewRef.current.scale, viewRef.current.offsetX, viewRef.current.offsetY);
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(data.x0, data.y0);
      ctx.lineTo(data.x1, data.y1);
      ctx.stroke();
    };

    const handleRemoteAction = (action) => {
      const existingIndex = historyRef.current.findIndex((a) => a.id === action.id);
      if (existingIndex === -1) historyRef.current.push(action);
      redrawBase();
    };

    const handleRemoteUpdate = ({ actionId, changes }) => {
      historyRef.current = historyRef.current.map((a) => (a.id === actionId ? { ...a, ...changes } : a));
      redrawBase();
    };

    const handleRemoteDelete = ({ actionId }) => {
      historyRef.current = historyRef.current.filter((a) => a.id !== actionId);
      redrawBase();
    };

    const handleRemoteUndo = () => {
      const last = historyRef.current.pop();
      if (last) redoRef.current.push(last);
      redrawBase();
    };

    const handleRemoteRedo = () => {
      const action = redoRef.current.pop();
      if (action) historyRef.current.push(action);
      redrawBase();
    };

    const handleRemoteClear = () => {
      historyRef.current = [];
      redoRef.current = [];
      redrawBase();
    };

    const handleRemoteCursor = (data) => {
      remoteCursorRef.current = data;
      redrawOverlay(null, null);
    };

    socket.on('whiteboard_draw', handleRemoteDraw);
    socket.on('whiteboard_action', handleRemoteAction);
    socket.on('whiteboard_action_update', handleRemoteUpdate);
    socket.on('whiteboard_action_delete', handleRemoteDelete);
    socket.on('whiteboard_undo', handleRemoteUndo);
    socket.on('whiteboard_redo', handleRemoteRedo);
    socket.on('whiteboard_clear', handleRemoteClear);
    socket.on('whiteboard_cursor', handleRemoteCursor);

    return () => {
      socket.off('whiteboard_draw', handleRemoteDraw);
      socket.off('whiteboard_action', handleRemoteAction);
      socket.off('whiteboard_action_update', handleRemoteUpdate);
      socket.off('whiteboard_action_delete', handleRemoteDelete);
      socket.off('whiteboard_undo', handleRemoteUndo);
      socket.off('whiteboard_redo', handleRemoteRedo);
      socket.off('whiteboard_clear', handleRemoteClear);
      socket.off('whiteboard_cursor', handleRemoteCursor);
    };
  }, [socket]);

  const commitAction = (action) => {
    historyRef.current.push(action);
    redoRef.current = [];
    socket.emit('whiteboard_action', { conversationId, action });
  };

  let lastCursorEmit = 0;
  const emitCursor = (worldPoint) => {
    const now = Date.now();
    if (now - lastCursorEmit < 40) return;
    lastCursorEmit = now;
    socket.emit('whiteboard_cursor', { conversationId, x: worldPoint.x, y: worldPoint.y, username, color: myColor.current });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const screenPoint = getScreenPoint(e);
    const worldBefore = toWorld(screenPoint.x, screenPoint.y);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(5, Math.max(0.2, viewRef.current.scale * factor));
    viewRef.current.offsetX = screenPoint.x - worldBefore.x * newScale;
    viewRef.current.offsetY = screenPoint.y - worldBefore.y * newScale;
    viewRef.current.scale = newScale;
    setZoomPct(Math.round(newScale * 100));
    redrawBase();
    redrawOverlay(null, null);
  };

  const handleMouseDown = (e) => {
    const screenPoint = getScreenPoint(e);
    const worldPoint = toWorld(screenPoint.x, screenPoint.y);

    if (spacePressed.current || e.button === 1) {
      isPanning.current = true;
      panStart.current = { screenPoint, offset: { ...viewRef.current } };
      return;
    }

    if (tool === 'select') {
      const hit = [...historyRef.current].reverse().find((a) => pointInBox(worldPoint, getBoundingBox(a)));
      selectedIdRef.current = hit ? hit.id : null;
      if (hit) {
        dragOriginRef.current = hit;
        dragStartWorldRef.current = worldPoint;
        redrawOverlay(null, getBoundingBox(hit));
      } else {
        redrawOverlay(null, null);
      }
      return;
    }

    startPoint.current = worldPoint;
    isDrawing.current = true;

    if (tool === 'text') {
      const text = prompt('Enter text:');
      isDrawing.current = false;
      if (!text) return;
      const action = { id: nextId(), type: 'text', x: worldPoint.x, y: worldPoint.y, text, color, size };
      drawAction(canvasRef.current.getContext('2d'), action);
      commitAction(action);
      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      currentStroke.current = [worldPoint];
    }
  };

  const handleMouseMove = (e) => {
    const screenPoint = getScreenPoint(e);
    const worldPoint = toWorld(screenPoint.x, screenPoint.y);
    emitCursor(worldPoint);

    if (isPanning.current) {
      const dx = screenPoint.x - panStart.current.screenPoint.x;
      const dy = screenPoint.y - panStart.current.screenPoint.y;
      viewRef.current.offsetX = panStart.current.offset.offsetX + dx;
      viewRef.current.offsetY = panStart.current.offset.offsetY + dy;
      redrawBase();
      redrawOverlay(null, null);
      return;
    }

    if (tool === 'select' && selectedIdRef.current && dragOriginRef.current) {
      const dx = worldPoint.x - dragStartWorldRef.current.x;
      const dy = worldPoint.y - dragStartWorldRef.current.y;
      const moved = translateAction(dragOriginRef.current, dx, dy);
      historyRef.current = historyRef.current.map((a) => (a.id === moved.id ? moved : a));
      redrawBase();
      redrawOverlay(null, getBoundingBox(moved));
      return;
    }

    if (!isDrawing.current) return;

    if (tool === 'pen' || tool === 'eraser') {
      const last = currentStroke.current[currentStroke.current.length - 1];
      const drawColor = tool === 'eraser' ? BG_COLOR : color;
      const ctx = canvasRef.current.getContext('2d');
      ctx.setTransform(viewRef.current.scale, 0, 0, viewRef.current.scale, viewRef.current.offsetX, viewRef.current.offsetY);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(worldPoint.x, worldPoint.y);
      ctx.stroke();

      socket.emit('whiteboard_draw', { conversationId, x0: last.x, y0: last.y, x1: worldPoint.x, y1: worldPoint.y, color: drawColor, size });
      currentStroke.current.push(worldPoint);
    } else if (['line', 'rect', 'circle'].includes(tool)) {
      const previewAction = { type: 'shape', shapeType: tool, x0: startPoint.current.x, y0: startPoint.current.y, x1: worldPoint.x, y1: worldPoint.y, color, size, fill };
      redrawOverlay(previewAction, null);
    }
  };

  const handleMouseUp = (e) => {
    if (isPanning.current) {
      isPanning.current = false;
      return;
    }

    if (tool === 'select') {
      if (selectedIdRef.current && dragOriginRef.current) {
        const finalAction = historyRef.current.find((a) => a.id === selectedIdRef.current);
        socket.emit('whiteboard_action_update', { conversationId, actionId: finalAction.id, changes: finalAction });
      }
      dragOriginRef.current = null;
      return;
    }

    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'pen' || tool === 'eraser') {
      if (currentStroke.current.length > 1) {
        commitAction({ id: nextId(), type: 'stroke', points: currentStroke.current, color, size, mode: tool });
      }
      currentStroke.current = [];
    } else if (['line', 'rect', 'circle'].includes(tool)) {
      const screenPoint = getScreenPoint(e);
      const worldPoint = toWorld(screenPoint.x, screenPoint.y);
      redrawOverlay(null, null);
      const action = { id: nextId(), type: 'shape', shapeType: tool, x0: startPoint.current.x, y0: startPoint.current.y, x1: worldPoint.x, y1: worldPoint.y, color, size, fill };
      drawAction(canvasRef.current.getContext('2d'), action);
      commitAction(action);
    }
  };

  const handleUndo = () => {
    const last = historyRef.current.pop();
    if (!last) return;
    redoRef.current.push(last);
    redrawBase();
    socket.emit('whiteboard_undo', conversationId);
  };

  const handleRedo = () => {
    const action = redoRef.current.pop();
    if (!action) return;
    historyRef.current.push(action);
    redrawBase();
    socket.emit('whiteboard_redo', conversationId);
  };

  const handleClear = () => {
    historyRef.current = [];
    redoRef.current = [];
    redrawBase();
    socket.emit('whiteboard_clear', conversationId);
  };

  const handleResetView = () => {
    viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 };
    setZoomPct(100);
    redrawBase();
    redrawOverlay(null, null);
  };

  const tools = [
    { id: 'pen', label: '✏️' },
    { id: 'eraser', label: '🧽' },
    { id: 'line', label: '╱' },
    { id: 'rect', label: '▭' },
    { id: 'circle', label: '◯' },
    { id: 'text', label: 'T' },
    { id: 'select', label: '↖' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        {tools.map((t) => (
          <button key={t.id} onClick={() => setTool(t.id)} style={{ ...styles.toolBtn, ...(tool === t.id ? styles.toolBtnActive : {}) }} title={t.id}>
            {t.label}
          </button>
        ))}

        <div style={styles.divider} />

        <label style={styles.fillLabel}>
          <input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> Fill
        </label>

        <div style={styles.divider} />

        {['#ffffff', '#f23f42', '#23a55a', '#5865f2', '#faa61a', '#eb459e'].map((c) => (
          <div key={c} onClick={() => setColor(c)} style={{ ...styles.swatch, background: c, border: color === c ? '2px solid #949ba4' : '2px solid transparent' }} />
        ))}
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={styles.colorPicker} />
        <input type="range" min="1" max="20" value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ marginLeft: 12 }} />

        <div style={styles.divider} />

        <button onClick={handleUndo} style={styles.actionBtn}>Undo</button>
        <button onClick={handleRedo} style={styles.actionBtn}>Redo</button>
        <span style={styles.zoomLabel}>{zoomPct}%</span>
        <button onClick={handleResetView} style={styles.actionBtn}>Reset view</button>
        <button onClick={handleClear} style={{ ...styles.actionBtn, marginLeft: 'auto' }}>Clear</button>
      </div>

      <div style={styles.canvasWrapper} ref={wrapperRef}>
        <canvas ref={canvasRef} style={styles.canvas} />
        <canvas
          ref={overlayRef}
          style={{ ...styles.canvas, position: 'absolute', top: 0, left: 0, cursor: tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair' }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
      <div style={styles.hint}>Hold Space + drag to pan · Scroll to zoom · Select tool: click a shape, Delete key removes it</div>
    </div>
  );
}

const styles = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', background: '#313338' },
  toolbar: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderBottom: '1px solid #1e1f22', background: '#2b2d31', flexWrap: 'wrap' },
  toolBtn: { background: '#404249', border: 'none', borderRadius: 4, padding: '6px 10px', color: '#dbdee1', cursor: 'pointer', fontSize: 14 },
  toolBtnActive: { background: '#5865f2', color: 'white' },
  fillLabel: { display: 'flex', alignItems: 'center', gap: 4, color: '#dbdee1', fontSize: 13 },
  divider: { width: 1, height: 24, background: '#1e1f22', margin: '0 6px' },
  swatch: { width: 20, height: 20, borderRadius: '50%', cursor: 'pointer' },
  colorPicker: { width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 },
  actionBtn: { background: '#404249', color: '#dbdee1', border: 'none', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 13 },
  zoomLabel: { color: '#949ba4', fontSize: 13, minWidth: 40, textAlign: 'center' },
  canvasWrapper: { flex: 1, position: 'relative', overflow: 'hidden' },
  canvas: { width: '100%', height: '100%', display: 'block' },
  hint: { padding: '6px 16px', fontSize: 11, color: '#72767d', background: '#2b2d31', borderTop: '1px solid #1e1f22' },
};

export default Whiteboard;