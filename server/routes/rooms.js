const express = require('express');
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ────────────────────────────────────────
// GET /api/rooms — Get user's rooms
// ────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ members: req.user._id })
      .populate('members', 'displayName avatar status lastSeen')
      .populate('lastMessage.sender', 'displayName')
      .sort({ updatedAt: -1 });

    res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms.' });
  }
});

// ────────────────────────────────────────
// POST /api/rooms — Create a new room
// ────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, type, memberIds } = req.body;

    if (type === 'direct') {
      if (!memberIds || memberIds.length !== 1) {
        return res.status(400).json({ error: 'Direct rooms require exactly one other member.' });
      }

      // Check if direct room already exists
      const existingRoom = await Room.findOne({
        type: 'direct',
        members: { $all: [req.user._id, memberIds[0]], $size: 2 },
      }).populate('members', 'displayName avatar status lastSeen');

      if (existingRoom) {
        return res.json({ room: existingRoom, existing: true });
      }
    }

    const allMembers = [req.user._id, ...(memberIds || [])];
    // Remove duplicates
    const uniqueMembers = [...new Set(allMembers.map(m => m.toString()))];

    const room = new Room({
      name: type === 'group' ? (name || 'New Group') : undefined,
      type: type || 'direct',
      members: uniqueMembers,
      admin: req.user._id,
    });

    await room.save();
    await room.populate('members', 'displayName avatar status lastSeen');

    res.status(201).json({ room });
  } catch (error) {
    console.error('Create room error:', error);
    res.status(500).json({ error: 'Failed to create room.' });
  }
});

// ────────────────────────────────────────
// GET /api/rooms/:id/messages — Get room messages
// ────────────────────────────────────────
router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { before, limit = 50 } = req.query;

    // Verify user is a member
    const room = await Room.findOne({ _id: id, members: req.user._id });
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const query = { room: id };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'displayName avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// ────────────────────────────────────────
// GET /api/rooms/search-users — Search users to start a chat
// ────────────────────────────────────────
router.get('/search-users', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await User.find({
      _id: { $ne: req.user._id },
      $or: [
        { displayName: { $regex: q, $options: 'i' } },
        { phone: { $regex: q } },
        { email: { $regex: q, $options: 'i' } },
      ],
    })
    .select('displayName avatar status phone email')
    .limit(20);

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users.' });
  }
});

module.exports = router;
