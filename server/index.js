require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // same-origin now, so this is just a safe fallback
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

const authRoutes = require('./routes/auth');
const serverRoutes = require('./routes/servers');
const messageRoutes = require('./routes/messages');
const dmRoutes = require('./routes/dms');
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/dms', dmRoutes);

// --- SERVE THE BUILT REACT APP ---
app.use(express.static(path.join(__dirname, '../client/dist')));

app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Track online users: { userId: Set of socket ids }
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // --- PRESENCE ---
  socket.on('identify', (userId) => {
    socket.userId = userId;
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);
    io.emit('online_users', Array.from(onlineUsers.keys()));
  });

  // --- CHANNELS ---
  socket.on('join_channel', (channelId) => {
    socket.join(`channel_${channelId}`);
  });

  socket.on('leave_channel', (channelId) => {
    socket.leave(`channel_${channelId}`);
  });

  socket.on('send_message', async ({ channelId, userId, content, username }) => {
    try {
      const result = await pool.query(
        `INSERT INTO messages (channel_id, user_id, content) 
         VALUES ($1, $2, $3) RETURNING *`,
        [channelId, userId, content]
      );
      const message = result.rows[0];
      message.username = username;
      io.to(`channel_${channelId}`).emit('receive_message', message);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  socket.on('edit_message', async ({ messageId, channelId, userId, content }) => {
    try {
      const result = await pool.query(
        `UPDATE messages SET content = $1, edited_at = NOW()
         WHERE id = $2 AND user_id = $3 RETURNING *`,
        [content, messageId, userId]
      );
      if (result.rows.length === 0) return;
      io.to(`channel_${channelId}`).emit('message_edited', result.rows[0]);
    } catch (err) {
      console.error('Error editing message:', err);
    }
  });

  socket.on('delete_message', async ({ messageId, channelId, userId }) => {
    try {
      const result = await pool.query(
        'DELETE FROM messages WHERE id = $1 AND user_id = $2 RETURNING id',
        [messageId, userId]
      );
      if (result.rows.length === 0) return;
      io.to(`channel_${channelId}`).emit('message_deleted', { messageId });
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  });

  // --- TYPING INDICATORS ---
  socket.on('typing', ({ channelId, username }) => {
    socket.to(`channel_${channelId}`).emit('user_typing', { username });
  });

  socket.on('stop_typing', ({ channelId, username }) => {
    socket.to(`channel_${channelId}`).emit('user_stop_typing', { username });
  });

  // --- DIRECT MESSAGES ---
  socket.on('join_dm', (conversationId) => {
    socket.join(`dm_${conversationId}`);
  });

  socket.on('leave_dm', (conversationId) => {
    socket.leave(`dm_${conversationId}`);
  });

  socket.on('send_dm', async ({ conversationId, senderId, content, username }) => {
    try {
      const result = await pool.query(
        `INSERT INTO dm_messages (conversation_id, sender_id, content)
         VALUES ($1, $2, $3) RETURNING *`,
        [conversationId, senderId, content]
      );
      const message = result.rows[0];
      message.username = username;
      io.to(`dm_${conversationId}`).emit('receive_dm', message);
    } catch (err) {
      console.error('Error saving DM:', err);
    }
  });

  socket.on('edit_dm', async ({ messageId, conversationId, userId, content }) => {
    try {
      const result = await pool.query(
        `UPDATE dm_messages SET content = $1, edited_at = NOW()
         WHERE id = $2 AND sender_id = $3 RETURNING *`,
        [content, messageId, userId]
      );
      if (result.rows.length === 0) return;
      io.to(`dm_${conversationId}`).emit('dm_edited', result.rows[0]);
    } catch (err) {
      console.error('Error editing DM:', err);
    }
  });

  socket.on('delete_dm', async ({ messageId, conversationId, userId }) => {
    try {
      const result = await pool.query(
        'DELETE FROM dm_messages WHERE id = $1 AND sender_id = $2 RETURNING id',
        [messageId, userId]
      );
      if (result.rows.length === 0) return;
      io.to(`dm_${conversationId}`).emit('dm_deleted', { messageId });
    } catch (err) {
      console.error('Error deleting DM:', err);
    }
  });

  socket.on('notify_dm_start', ({ targetUserId, conversation }) => {
    const targetSockets = onlineUsers.get(targetUserId);
    if (targetSockets) {
      targetSockets.forEach((socketId) => {
        io.to(socketId).emit('new_conversation', conversation);
      });
    }
  });

  // --- WHITEBOARD ---
  socket.on('whiteboard_draw', (data) => {
    socket.to(`dm_${data.conversationId}`).emit('whiteboard_draw', data);
  });

  socket.on('whiteboard_action', ({ conversationId, action }) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_action', action);
  });

  socket.on('whiteboard_action_update', ({ conversationId, actionId, changes }) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_action_update', { actionId, changes });
  });

  socket.on('whiteboard_action_delete', ({ conversationId, actionId }) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_action_delete', { actionId });
  });

  socket.on('whiteboard_undo', (conversationId) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_undo');
  });

  socket.on('whiteboard_redo', (conversationId) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_redo');
  });

  socket.on('whiteboard_clear', (conversationId) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_clear');
  });

  socket.on('whiteboard_cursor', ({ conversationId, x, y, username, color }) => {
    socket.to(`dm_${conversationId}`).emit('whiteboard_cursor', { x, y, username, color });
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId && onlineUsers.has(socket.userId)) {
      const sockets = onlineUsers.get(socket.userId);
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(socket.userId);
      }
      io.emit('online_users', Array.from(onlineUsers.keys()));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});