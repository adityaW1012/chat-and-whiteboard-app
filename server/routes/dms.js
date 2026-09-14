const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Helper: always order the two user ids consistently
function orderIds(a, b) {
  return a < b ? [a, b] : [b, a];
}

// Get or create a conversation with another user (by their username)
router.post('/start', authenticateToken, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  try {
    const otherUserResult = await pool.query('SELECT id, username FROM users WHERE username = $1', [username]);
    const otherUser = otherUserResult.rows[0];

    if (!otherUser) return res.status(404).json({ error: 'User not found' });
    if (otherUser.id === req.userId) return res.status(400).json({ error: "Can't DM yourself" });

    const [user1, user2] = orderIds(req.userId, otherUser.id);

    // Try to find existing conversation
    const existing = await pool.query(
      'SELECT * FROM dm_conversations WHERE user1_id = $1 AND user2_id = $2',
      [user1, user2]
    );

    let conversation;
    if (existing.rows.length > 0) {
      conversation = existing.rows[0];
    } else {
      const created = await pool.query(
        'INSERT INTO dm_conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING *',
        [user1, user2]
      );
      conversation = created.rows[0];
    }

    res.json({ ...conversation, otherUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

// List all of the logged-in user's DM conversations, with the other person's info
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, 
              CASE WHEN c.user1_id = $1 THEN u2.id ELSE u1.id END AS other_user_id,
              CASE WHEN c.user1_id = $1 THEN u2.username ELSE u1.username END AS other_username
       FROM dm_conversations c
       JOIN users u1 ON c.user1_id = u1.id
       JOIN users u2 ON c.user2_id = u2.id
       WHERE c.user1_id = $1 OR c.user2_id = $1`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a conversation
router.get('/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.username FROM dm_messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.conversationId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

module.exports = router;