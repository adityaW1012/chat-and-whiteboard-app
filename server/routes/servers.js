const { nanoid } = require('nanoid');
const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Create a server
router.post('/', authenticateToken, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Server name is required' });

  try {
    const inviteCode = nanoid(8); // e.g. "aB3xY9pQ"

    const result = await pool.query(
      'INSERT INTO servers (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING *',
      [name, req.userId, inviteCode]
    );
    const server = result.rows[0];

    await pool.query(
      'INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)',
      [server.id, req.userId]
    );

    await pool.query(
      'INSERT INTO channels (server_id, name) VALUES ($1, $2)',
      [server.id, 'general']
    );

    res.status(201).json(server);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create server' });
  }
});

router.post('/join', authenticateToken, async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

  try {
    const serverResult = await pool.query(
      'SELECT * FROM servers WHERE invite_code = $1',
      [inviteCode]
    );
    const server = serverResult.rows[0];

    if (!server) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    // Check if already a member
    const existing = await pool.query(
      'SELECT id FROM server_members WHERE server_id = $1 AND user_id = $2',
      [server.id, req.userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already a member of this server' });
    }

    await pool.query(
      'INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)',
      [server.id, req.userId]
    );

    res.status(200).json(server);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to join server' });
  }
});

// Get all servers the logged-in user is a member of
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.* FROM servers s
       JOIN server_members sm ON s.id = sm.server_id
       WHERE sm.user_id = $1`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Get channels for a specific server
router.get('/:serverId/channels', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM channels WHERE server_id = $1',
      [req.params.serverId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

router.get('/:serverId/members', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username FROM users u
       JOIN server_members sm ON u.id = sm.user_id
       WHERE sm.server_id = $1`,
      [req.params.serverId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

module.exports = router;