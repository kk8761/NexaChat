const Message = require('../models/Message');
const Room = require('../models/Room');
const User = require('../models/User');

// Track online users: userId -> Set of socketIds (supports multiple tabs/devices)
const onlineUsers = new Map();

function setupSocketHandlers(io) {
  io.on('connection', async (socket) => {
    const user = socket.user;
    if (!user) return socket.disconnect(true);
    console.log(`⚡ User connected: ${user.displayName} (${socket.id})`);

    // ──── Track online status (concurrency: multiple devices/tabs) ────
    if (!onlineUsers.has(user._id.toString())) {
      onlineUsers.set(user._id.toString(), new Set());
    }
    onlineUsers.get(user._id.toString()).add(socket.id);

    // Update user status to online
    await User.findByIdAndUpdate(user._id, { status: 'online', lastSeen: new Date() });

    // Join personal room for direct messages
    socket.join(`user:${user._id}`);

    // Join all existing chat rooms this user is part of
    const userRooms = await Room.find({ members: user._id }).select('_id');
    userRooms.forEach(room => {
      socket.join(`room:${room._id}`);
    });

    // Broadcast online status to all connected users
    io.emit('user-online', { userId: user._id, status: 'online' });

    // Send current online users list to the connecting client
    const onlineUserIds = Array.from(onlineUsers.keys());
    socket.emit('online-users', onlineUserIds);

    // ──── JOIN ROOM ────
    socket.on('join-room', async ({ roomId }) => {
      try {
        const room = await Room.findOne({ _id: roomId, members: user._id });
        if (!room) return socket.emit('error', { message: 'Room not found' });

        socket.join(`room:${roomId}`);
        console.log(`📌 ${user.displayName} joined room ${roomId}`);
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ──── SEND MESSAGE (concurrent-safe) ────
    socket.on('send-message', async ({ roomId, content, type = 'text' }) => {
      try {
        if (!content || !content.trim()) return;

        // Verify membership
        const room = await Room.findOne({ _id: roomId, members: user._id });
        if (!room) return socket.emit('error', { message: 'Not a member of this room' });

        // Sanitize content
        const sanitizedContent = content.trim().slice(0, 5000);

        // Save message to DB (atomic operation — safe for concurrency)
        const message = new Message({
          sender: user._id,
          room: roomId,
          content: sanitizedContent,
          type,
          readBy: [{ user: user._id }],
        });
        await message.save();

        // Populate sender info for broadcasting
        await message.populate('sender', 'displayName avatar');

        // Update room's last message (atomic update)
        await Room.findByIdAndUpdate(roomId, {
          lastMessage: {
            content: sanitizedContent.slice(0, 100),
            sender: user._id,
            createdAt: message.createdAt,
          },
        });

        // Broadcast to ALL members in the room (including sender for confirmation)
        // Socket.IO rooms handle concurrency — each user gets the message
        // regardless of how many are connected simultaneously
        io.to(`room:${roomId}`).emit('new-message', {
          message: {
            _id: message._id,
            sender: message.sender,
            room: roomId,
            content: message.content,
            type: message.type,
            readBy: message.readBy,
            createdAt: message.createdAt,
          },
        });

        // Also notify room members about the updated room (for sidebar)
        io.to(`room:${roomId}`).emit('room-updated', {
          roomId,
          lastMessage: {
            content: sanitizedContent.slice(0, 100),
            sender: { _id: user._id, displayName: user.displayName },
            createdAt: message.createdAt,
          },
        });

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ──── TYPING INDICATORS ────
    socket.on('typing', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('user-typing', {
        userId: user._id,
        displayName: user.displayName,
        roomId,
      });
    });

    socket.on('stop-typing', ({ roomId }) => {
      socket.to(`room:${roomId}`).emit('user-stop-typing', {
        userId: user._id,
        roomId,
      });
    });

    // ──── MARK MESSAGES AS READ ────
    socket.on('mark-read', async ({ roomId }) => {
      try {
        await Message.updateMany(
          {
            room: roomId,
            'readBy.user': { $ne: user._id },
          },
          {
            $addToSet: { readBy: { user: user._id, readAt: new Date() } },
          }
        );

        // Notify others that this user has read messages
        socket.to(`room:${roomId}`).emit('messages-read', {
          userId: user._id,
          roomId,
        });
      } catch (error) {
        console.error('Mark read error:', error);
      }
    });

    // ──── REACTIONS ────
    socket.on('add-reaction', async ({ messageId, roomId, emoji }) => {
      try {
        const message = await Message.findOne({ _id: messageId, room: roomId });
        if (!message) return;

        // Find if user already reacted with THIS emoji
        const existingReaction = message.reactions.find(r => r.user.toString() === user._id.toString() && r.emoji === emoji);
        
        if (!existingReaction) {
          message.reactions.push({ user: user._id, emoji });
          await message.save();

          io.to(`room:${roomId}`).emit('message-reaction-updated', {
            messageId,
            roomId,
            reactions: message.reactions,
          });
        }
      } catch (error) {
        console.error('Add reaction error:', error);
      }
    });

    socket.on('remove-reaction', async ({ messageId, roomId, emoji }) => {
      try {
        const message = await Message.findOne({ _id: messageId, room: roomId });
        if (!message) return;

        message.reactions = message.reactions.filter(r => !(r.user.toString() === user._id.toString() && r.emoji === emoji));
        await message.save();

        io.to(`room:${roomId}`).emit('message-reaction-updated', {
          messageId,
          roomId,
          reactions: message.reactions,
        });
      } catch (error) {
        console.error('Remove reaction error:', error);
      }
    });

    // ──── UPDATE ROOM THEME ────
    socket.on('update-room-theme', async ({ roomId, theme }) => {
      try {
        const room = await Room.findOne({ _id: roomId, members: user._id });
        if (!room) return;

        room.theme = theme;
        await room.save();

        io.to(`room:${roomId}`).emit('room-theme-updated', {
          roomId,
          theme,
        });
      } catch (error) {
        console.error('Update room theme error:', error);
      }
    });

    // ──── CREATE/JOIN NEW ROOM ────
    socket.on('create-room', async ({ name, type, memberIds }) => {
      try {
        const allMembers = [user._id, ...memberIds];
        
        // For direct chats, check if room already exists
        if (type === 'direct' && memberIds.length === 1) {
          const existing = await Room.findOne({
            type: 'direct',
            members: { $all: allMembers, $size: 2 },
          }).populate('members', 'displayName avatar status lastSeen');

          if (existing) {
            socket.join(`room:${existing._id}`);
            socket.emit('room-created', { room: existing, existing: true });
            return;
          }
        }

        const room = new Room({
          name: type === 'group' ? (name || 'New Group') : undefined,
          type,
          members: allMembers,
          admin: user._id,
        });
        await room.save();
        await room.populate('members', 'displayName avatar status lastSeen');

        // Add all members to the socket room
        const memberSocketIds = [];
        allMembers.forEach(memberId => {
          const memberSockets = onlineUsers.get(memberId.toString());
          if (memberSockets) {
            memberSockets.forEach(sid => {
              const memberSocket = io.sockets.sockets.get(sid);
              if (memberSocket) {
                memberSocket.join(`room:${room._id}`);
                memberSocketIds.push(sid);
              }
            });
          }
        });

        // Notify all members about the new room
        allMembers.forEach(memberId => {
          io.to(`user:${memberId}`).emit('room-created', { room });
        });
      } catch (error) {
        console.error('Create room error:', error);
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    // ──── DISCONNECT ────
    socket.on('disconnect', async () => {
      console.log(`💤 User disconnected: ${user.displayName} (${socket.id})`);

      // Remove this socket from tracking
      const userSockets = onlineUsers.get(user._id.toString());
      if (userSockets) {
        userSockets.delete(socket.id);
        
        // Only mark offline if ALL tabs/devices are disconnected
        if (userSockets.size === 0) {
          onlineUsers.delete(user._id.toString());
          await User.findByIdAndUpdate(user._id, { 
            status: 'offline', 
            lastSeen: new Date() 
          });
          io.emit('user-offline', { userId: user._id, lastSeen: new Date() });
        }
      }
    });
  });
}

module.exports = { setupSocketHandlers, onlineUsers };
