const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Get messages for a channel
router.get('/:channelId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.username FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.channel_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.channelId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Post a message to a channel
router.post('/:channelId', authenticateToken, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Message content required' });

  try {
    const result = await pool.query(
      `INSERT INTO messages (channel_id, user_id, content) 
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.channelId, req.userId, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

module.exports = router;