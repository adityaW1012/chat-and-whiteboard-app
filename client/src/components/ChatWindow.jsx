import { useState, useEffect, useRef } from 'react';
import { getAvatarUrl } from '../utils/avatar';

function ChatWindow({ channel, messages, onSendMessage, onEditMessage, onDeleteMessage, socket, username, currentUserId }) {
  const [text, setText] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [hoveredId, setHoveredId] = useState(null);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    const handleTyping = ({ username: typer }) => {
      setTypingUsers((prev) => (prev.includes(typer) ? prev : [...prev, typer]));
    };
    const handleStopTyping = ({ username: typer }) => {
      setTypingUsers((prev) => prev.filter((u) => u !== typer));
    };
    socket.on('user_typing', handleTyping);
    socket.on('user_stop_typing', handleStopTyping);
    return () => {
      socket.off('user_typing', handleTyping);
      socket.off('user_stop_typing', handleStopTyping);
    };
  }, [socket]);

  useEffect(() => {
    setTypingUsers([]);
    setEditingId(null);
  }, [channel]);

  const handleChange = (e) => {
    setText(e.target.value);
    if (!channel || !socket) return;
    socket.emit('typing', { channelId: channel.id, username });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { channelId: channel.id, username });
    }, 2000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text);
    setText('');
    clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing', { channelId: channel.id, username });
  };

  const startEdit = (msg) => {
    setEditingId(msg.id);
    setEditText(msg.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const submitEdit = (e, msg) => {
    e.preventDefault();
    if (!editText.trim()) return;
    onEditMessage(msg.id, editText);
    setEditingId(null);
  };

  const handleDelete = (msg) => {
    if (confirm('Delete this message?')) {
      onDeleteMessage(msg.id);
    }
  };

  if (!channel) {
    return <div style={styles.empty}>Select a channel to start chatting</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ opacity: 0.6, marginRight: 6 }}>#</span>
        {channel.name}
      </div>

      <div style={styles.messages}>
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const isGrouped = prev && prev.username === msg.username &&
            new Date(msg.created_at) - new Date(prev.created_at) < 5 * 60 * 1000;
          const isOwn = msg.user_id === currentUserId || msg.sender_id === currentUserId;
          const isEditing = editingId === msg.id;

          return (
            <div
              key={msg.id}
              style={{ ...styles.messageRow, marginTop: isGrouped ? 1 : 17 }}
              onMouseEnter={() => setHoveredId(msg.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {!isGrouped ? (
                <img src={getAvatarUrl(msg.username)} alt={msg.username} style={styles.avatar} />
              ) : (
                <div style={styles.avatarSpacer} />
              )}
              <div style={{ flex: 1, position: 'relative' }}>
                {!isGrouped && (
                  <div>
                    <span style={styles.username}>{msg.username}</span>
                    <span style={styles.timestamp}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}

                {isEditing ? (
                  <form onSubmit={(e) => submitEdit(e, msg)} style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      style={styles.editInput}
                      autoFocus
                    />
                    <button type="submit" style={styles.smallBtn}>Save</button>
                    <button type="button" onClick={cancelEdit} style={styles.smallBtn}>Cancel</button>
                  </form>
                ) : (
                  <div style={styles.content}>
                    {msg.content}
                    {msg.edited_at && <span style={styles.editedTag}> (edited)</span>}
                  </div>
                )}

                {isOwn && hoveredId === msg.id && !isEditing && (
                  <div style={styles.hoverActions}>
                    <span onClick={() => startEdit(msg)} style={styles.hoverBtn}>Edit</span>
                    <span onClick={() => handleDelete(msg)} style={styles.hoverBtn}>Delete</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputArea}>
        {typingUsers.length > 0 && (
          <div style={styles.typingIndicator}>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <input
            value={text}
            onChange={handleChange}
            placeholder={`Message #${channel.name}`}
            style={styles.input}
          />
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', background: '#313338', color: '#dbdee1' },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #1e1f22',
    boxShadow: '0 1px 0 rgba(0,0,0,0.2)',
    fontWeight: 600,
    fontSize: 15,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
  },
  messages: { flex: 1, padding: '16px 16px 0', overflowY: 'auto' },
  messageRow: { display: 'flex', gap: 16, paddingRight: 16, position: 'relative' },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: '#40444b', flexShrink: 0 },
  avatarSpacer: { width: 40, flexShrink: 0 },
  username: { fontWeight: 600, marginRight: 8, fontSize: 15, color: '#fff' },
  timestamp: { fontSize: 11, color: '#949ba4' },
  content: { fontSize: 15, lineHeight: 1.4, color: '#dbdee1' },
  editedTag: { fontSize: 10, color: '#72767d' },
  typingIndicator: { padding: '0 0 4px 4px', fontSize: 12, color: '#949ba4', fontStyle: 'italic' },
  inputArea: { padding: '0 16px 16px' },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: 8,
    border: 'none',
    background: '#383a40',
    color: '#dbdee1',
    outline: 'none',
    fontSize: 15,
  },
  editInput: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 4,
    border: 'none',
    background: '#383a40',
    color: '#dbdee1',
    outline: 'none',
    fontSize: 14,
  },
  smallBtn: {
    background: '#404249',
    color: '#dbdee1',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
  },
  hoverActions: {
    position: 'absolute',
    top: -14,
    right: 0,
    background: '#2b2d31',
    border: '1px solid #1e1f22',
    borderRadius: 4,
    display: 'flex',
    gap: 4,
    padding: '2px 4px',
  },
  hoverBtn: { fontSize: 11, color: '#949ba4', cursor: 'pointer', padding: '2px 4px' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#72767d', background: '#313338' },
};

export default ChatWindow;