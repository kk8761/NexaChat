const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  avatar: {
    type: String,
    default: '',
  },
  bio: {
    type: String,
    default: 'Hey there! I\'m using NexaChat ✨',
    maxlength: 200,
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'away'],
    default: 'offline',
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Generate avatar URL from name if not set
userSchema.pre('save', function(next) {
  if (!this.avatar) {
    const name = encodeURIComponent(this.displayName);
    this.avatar = `https://ui-avatars.com/api/?name=${name}&background=0a0a2e&color=00f5ff&size=128&bold=true`;
  }
  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
