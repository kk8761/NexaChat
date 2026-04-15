const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000,
    trim: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'system', 'emoji', 'file'],
    default: 'text',
  },
  file: {
    url: String,
    name: String,
    size: Number,
    extension: String,
    mimeType: String
  },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, required: true },
  }],
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
});

// Index for efficient room message queries with pagination
messageSchema.index({ room: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
