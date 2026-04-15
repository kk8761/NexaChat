const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: 100,
  },
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct',
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastMessage: {
    content: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: Date,
  },
  avatar: {
    type: String,
    default: '',
  },
  theme: {
    type: String,
    default: 'default',
  },
}, {
  timestamps: true,
});

// Index for finding rooms a user belongs to
roomSchema.index({ members: 1 });
// Index for finding direct rooms between two users
roomSchema.index({ type: 1, members: 1 });

const Room = mongoose.model('Room', roomSchema);
module.exports = Room;
