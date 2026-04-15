const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const Story = require('../models/Story');
const Room = require('../models/Room');
const User = require('../models/User');

const router = express.Router();

// ────────────────────────────────────────
// GET /api/stories 
// Fetch active stories for the user and their contacts
// ────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1. Find people the user has active chats with.
    // Fetch all rooms the user is part of
    const rooms = await Room.find({ members: userId }).select('members');
    
    // Extract unique member IDs
    const contactIds = new Set();
    contactIds.add(userId.toString()); // Always include self
    
    rooms.forEach(room => {
      room.members.forEach(member => {
        contactIds.add(member.toString());
      });
    });

    // 2. Find active stories from these contacts
    const activeStories = await Story.find({
      user: { $in: Array.from(contactIds) },
      expiresAt: { $gt: new Date() } // Ensure it hasn't expired
    }).populate('user', 'displayName avatar _id').sort({ createdAt: 1 });

    // 3. Group stories by user
    const groupedStoriesMap = {};
    
    activeStories.forEach(story => {
      const uId = story.user._id.toString();
      if (!groupedStoriesMap[uId]) {
        groupedStoriesMap[uId] = {
          user: story.user,
          stories: []
        };
      }
      groupedStoriesMap[uId].stories.push({
        _id: story._id,
        content: story.content,
        bgColor: story.bgColor,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt
      });
    });

    // Convert map to array and put the current user first if they have a story
    let groupedStoriesArray = Object.values(groupedStoriesMap);
    
    const myStoryIndex = groupedStoriesArray.findIndex(g => g.user._id.toString() === userId.toString());
    if (myStoryIndex > -1) {
      const myStory = groupedStoriesArray.splice(myStoryIndex, 1)[0];
      groupedStoriesArray.unshift(myStory);
    }

    res.json({ success: true, stories: groupedStoriesArray });
  } catch (error) {
    console.error('Fetch stories error:', error);
    res.status(500).json({ error: 'Failed to fetch stories.' });
  }
});

// ────────────────────────────────────────
// POST /api/stories
// Create a new text story
// ────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content, bgColor } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Story content is required.' });
    }

    // Set expiration 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = new Story({
      user: req.user._id,
      content: content.trim(),
      bgColor: bgColor || 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
      expiresAt
    });

    await story.save();

    await story.populate('user', 'displayName avatar _id');

    // Optionally you could trigger a socket event 'new-story' here,
    // but the UI can just re-fetch stories when notifying or polling.
    // For simplicity, we just return success.

    res.json({ success: true, story });
  } catch (error) {
    console.error('Create story error:', error);
    res.status(500).json({ error: 'Failed to create story.' });
  }
});

module.exports = router;
