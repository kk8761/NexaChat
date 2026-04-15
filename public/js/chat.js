/* ═══════════════════════════════════════════════════
   NexaChat — Chat Page Logic (Socket.IO + Real-time)
   ═══════════════════════════════════════════════════ */

let socket;
let currentUser;
let currentRoomId = null;
let rooms = [];
let onlineUserIds = new Set();
let typingTimeout;
let isTyping = false;
let unreadCount = 0; // Tracks total unread messages while tabbed out

document.addEventListener('DOMContentLoaded', () => {
  // Auth check
  if (!isAuthenticated()) {
    navigateTo('/');
    return;
  }

  currentUser = getUser();
  if (!currentUser) {
    clearAuth();
    navigateTo('/');
    return;
  }

  initUI();
  initSocket();
  loadRooms();
  initEventListeners();
  
  // Init Mood Engine
  const savedMood = localStorage.getItem('nexa-mood') || 'default';
  document.documentElement.setAttribute('data-mood', savedMood);
  const moodSelector = document.getElementById('mood-selector');
  if (moodSelector) moodSelector.value = savedMood;

  // Clear unread badge on tab focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      unreadCount = 0;
      updateTitleBadge();
    }
  });
});

function updateTitleBadge() {
  if (unreadCount > 0) {
    document.title = `(${unreadCount}) NexaChat`;
  } else {
    document.title = 'NexaChat';
  }
}

// ═══════════════════════════════════════════════════
// UI INITIALIZATION
// ═══════════════════════════════════════════════════
function initUI() {
  // Request Notification Permissions if not granted or denied
  if ('Notification' in window && Notification.permission === 'default') {
    // delay slightly to not overwhelm on very first load instantly
    setTimeout(() => {
      Notification.requestPermission();
    }, 2000);
  }

  // Set profile info
  document.getElementById('profile-name').textContent = currentUser.displayName;
  document.getElementById('profile-avatar').src = currentUser.avatar || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.displayName)}&background=0a0a2e&color=00f5ff&size=128&bold=true`;
}

// ═══════════════════════════════════════════════════
// SOCKET.IO CONNECTION & EVENTS
// ═══════════════════════════════════════════════════
function initSocket() {
  socket = io({
    auth: { token: getToken() },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // Connection events
  socket.on('connect', () => {
    console.log('⚡ Connected to NexaChat server');
    showToast('Connected!', 'success', 2000);
  });

  socket.on('disconnect', (reason) => {
    console.log('💤 Disconnected:', reason);
    if (reason !== 'io client disconnect') {
      showToast('Connection lost. Reconnecting...', 'error', 3000);
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error.message);
    if (error.message.includes('Authentication')) {
      clearAuth();
      navigateTo('/');
    }
  });

  // ── Real-time message receiving (concurrency) ──
  socket.on('new-message', ({ message }) => {
    const isMe = message.sender._id === currentUser._id;
    
    // Add message to current chat if it's the active room
    if (message.room === currentRoomId) {
      appendMessage(message);
      scrollToBottom();
      
      // Mark as read only if we are actively looking at the window
      if (!document.hidden) {
        socket.emit('mark-read', { roomId: currentRoomId });
      }
    }

    if (!isMe) {
      // 1. Check if the browser tab is hidden/minimized
      if (document.hidden) {
        unreadCount++;
        updateTitleBadge();
        
        // Native OS Push Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(`New Message from ${message.sender.displayName}`, {
            body: message.content.slice(0, 50),
          });
          
          n.onclick = () => {
            window.focus(); // Bring browser to front
            selectRoom(message.room); // Switch to the right chat
            n.close();
          };
        } else {
          // Backup fallback
          playNotificationSound();
        }
      } 
      // 2. App is visible, but user is in a different room
      else if (message.room !== currentRoomId) {
        playNotificationSound();
        // In-App Toast Notification dropdown
        showToast(`${message.sender.displayName}: ${message.content.slice(0, 50)}`, 'info');
      }
    }

    // Update sidebar
    updateRoomInSidebar(message.room, message);
  });

  // ── Room updates ──
  socket.on('room-updated', ({ roomId, lastMessage }) => {
    const room = rooms.find(r => r._id === roomId);
    if (room) {
      room.lastMessage = lastMessage;
      room.updatedAt = lastMessage.createdAt;
      renderRoomList();
    }
  });

  // ── Room created ──
  socket.on('room-created', ({ room }) => {
    // Add to rooms if not already there
    if (!rooms.find(r => r._id === room._id)) {
      rooms.unshift(room);
      renderRoomList();
    }
    // Auto-open the new room
    selectRoom(room._id);
    closeNewChatModal();
  });

  // ── Online presence ──
  socket.on('online-users', (userIds) => {
    onlineUserIds = new Set(userIds);
    updateOnlineStatuses();
  });

  socket.on('user-online', ({ userId }) => {
    onlineUserIds.add(userId);
    updateOnlineStatuses();
    updateChatHeaderStatus();
  });

  socket.on('user-offline', ({ userId, lastSeen }) => {
    onlineUserIds.delete(userId);
    updateOnlineStatuses();
    updateChatHeaderStatus();
  });

  // ── Typing indicators ──
  socket.on('user-typing', ({ userId, displayName, roomId }) => {
    if (roomId === currentRoomId && userId !== currentUser._id) {
      showTypingIndicator(displayName);
    }
  });

  socket.on('user-stop-typing', ({ userId, roomId }) => {
    if (roomId === currentRoomId) {
      hideTypingIndicator();
    }
  });

  // ── Messages read ──
  socket.on('messages-read', ({ userId, roomId }) => {
    if (roomId === currentRoomId) {
      // Update read receipts UI
      document.querySelectorAll('.message.sent .message-status').forEach(el => {
        el.textContent = '👀';
        el.classList.add('read');
      });
    }
  });

  // ── Reactions ──
  socket.on('message-reaction-updated', ({ messageId, roomId, reactions }) => {
    if (roomId === currentRoomId) {
      updateMessageReactions(messageId, reactions);
    }
  });

  // ── Theme ──
  socket.on('room-theme-updated', ({ roomId, theme }) => {
    const room = rooms.find(r => r._id === roomId);
    if (room) {
      room.theme = theme;
      if (roomId === currentRoomId) {
        applyRoomTheme(theme);
      }
    }
  });

  // ── Error handling ──
  socket.on('error', ({ message }) => {
    showToast(message, 'error');
  });
}

// ═══════════════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════════════
async function loadRooms() {
  try {
    const data = await api('/api/rooms');
    rooms = data.rooms;
    renderRoomList();
  } catch (error) {
    console.error('Failed to load rooms:', error);
    showToast('Failed to load conversations', 'error');
  }
}

function renderRoomList(filter = '') {
  const roomList = document.getElementById('room-list');
  const emptyState = document.getElementById('empty-rooms');

  // Filter rooms
  let filteredRooms = rooms;
  if (filter) {
    const q = filter.toLowerCase();
    filteredRooms = rooms.filter(room => {
      const name = getRoomName(room).toLowerCase();
      return name.includes(q);
    });
  }

  if (filteredRooms.length === 0) {
    roomList.innerHTML = '';
    roomList.appendChild(emptyState);
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  // Sort by last message time
  filteredRooms.sort((a, b) => {
    const timeA = a.lastMessage?.createdAt || a.updatedAt || a.createdAt;
    const timeB = b.lastMessage?.createdAt || b.updatedAt || b.createdAt;
    return new Date(timeB) - new Date(timeA);
  });

  roomList.innerHTML = '';
  filteredRooms.forEach(room => {
    const el = createRoomElement(room);
    roomList.appendChild(el);
  });
}

function createRoomElement(room) {
  const el = document.createElement('div');
  el.className = `room-item${room._id === currentRoomId ? ' active' : ''}`;
  el.dataset.roomId = room._id;

  const otherUser = getOtherUser(room);
  const roomName = getRoomName(room);
  const avatar = getRoomAvatar(room);
  const isOnline = otherUser && onlineUserIds.has(otherUser._id);
  const lastMsg = room.lastMessage;

  el.innerHTML = `
    <img src="${escapeHtml(avatar)}" alt="${escapeHtml(roomName)}" class="room-avatar">
    <div class="room-details">
      <div class="room-header">
        <span class="room-name">${escapeHtml(roomName)}</span>
        ${lastMsg?.createdAt ? `<span class="room-time">${formatTime(lastMsg.createdAt)}</span>` : ''}
      </div>
      <div class="room-last-message">
        ${lastMsg ? escapeHtml(lastMsg.content || '').slice(0, 40) : 'Start a conversation...'}
      </div>
    </div>
    ${room.type === 'direct' && isOnline ? `<div class="status-dot online"></div>` : ''}
  `;

  el.addEventListener('click', () => selectRoom(room._id));
  return el;
}

function getRoomName(room) {
  if (room.type === 'group') return room.name || 'Group Chat';
  const other = getOtherUser(room);
  return other?.displayName || 'Unknown User';
}

function getRoomAvatar(room) {
  if (room.type === 'group') {
    return room.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(room.name || 'G')}&background=1a1a3e&color=bf00ff&size=128&bold=true`;
  }
  const other = getOtherUser(room);
  return other?.avatar || `https://ui-avatars.com/api/?name=?&background=0a0a2e&color=00f5ff&size=128`;
}

function getOtherUser(room) {
  if (!room.members) return null;
  return room.members.find(m => m._id !== currentUser._id) || room.members[0];
}

// ═══════════════════════════════════════════════════
// CHAT INTERACTION
// ═══════════════════════════════════════════════════
async function selectRoom(roomId) {
  currentRoomId = roomId;
  const room = rooms.find(r => r._id === roomId);
  if (!room) return;

  // Update UI
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');

  // Update header
  const roomName = getRoomName(room);
  const avatar = getRoomAvatar(room);
  document.getElementById('chat-name').textContent = roomName;
  document.getElementById('chat-avatar').src = avatar;
  updateChatHeaderStatus();

  // Apply room theme
  applyRoomTheme(room.theme || 'default');

  // Mark active in sidebar
  document.querySelectorAll('.room-item').forEach(el => {
    el.classList.toggle('active', el.dataset.roomId === roomId);
  });

  // Hide sidebar on mobile
  document.getElementById('sidebar').classList.add('hidden-mobile');

  // Join room via socket
  socket.emit('join-room', { roomId });

  // Load messages
  await loadMessages(roomId);

  // Mark as read
  socket.emit('mark-read', { roomId });

  // Focus input
  document.getElementById('message-input').focus();
}

async function loadMessages(roomId) {
  const container = document.getElementById('messages-container');
  container.innerHTML = '<div class="flex-center" style="padding:2rem;"><div class="spinner"></div></div>';

  try {
    const data = await api(`/api/rooms/${roomId}/messages`);
    container.innerHTML = '';
    
    if (data.messages.length === 0) {
      container.innerHTML = `
        <div class="system-message" style="padding: 3rem;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">👋</div>
          Start the conversation! Send your first message.
        </div>
      `;
      return;
    }

    let lastDate = '';
    data.messages.forEach(msg => {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        appendDateSeparator(msg.createdAt);
      }
      appendMessage(msg, false);
    });

    scrollToBottom(false);
  } catch (error) {
    console.error('Failed to load messages:', error);
    container.innerHTML = '<div class="system-message">Failed to load messages</div>';
  }
}

function appendMessage(msg, animate = true) {
  const container = document.getElementById('messages-container');
  
  // Remove empty state if present
  const emptyState = container.querySelector('.system-message');
  if (emptyState && emptyState.textContent.includes('Start the conversation')) {
    emptyState.remove();
  }

  const isSent = msg.sender._id === currentUser._id || msg.sender === currentUser._id;
  
  const el = document.createElement('div');
  el.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
  if (!animate) el.style.animation = 'none';
  el.dataset.messageId = msg._id;

  const senderName = msg.sender.displayName || '';
  const senderAvatar = msg.sender.avatar || 
    `https://ui-avatars.com/api/?name=${encodeURIComponent(senderName || '?')}&background=0a0a2e&color=bf00ff&size=64`;

  const reactionBadgeHtml = msg.reactions && msg.reactions.length > 0
    ? `<div class="message-reactions-list">${msg.reactions.map(r => `<span class="reaction-item" data-emoji="${r.emoji}">${r.emoji}</span>`).join('')}</div>`
    : '<div class="message-reactions-list"></div>';

  el.innerHTML = `
    ${!isSent ? `<div class="message-sender-name">${escapeHtml(senderName)}</div>` : ''}
    <div class="message-content">
      <div class="message-text">${formatMessageContent(msg.content)}</div>
      <div class="message-meta">
        <span class="message-time">${formatMessageTime(msg.createdAt)}</span>
        ${isSent ? `<span class="message-status ${msg.readBy && msg.readBy.length > 1 ? 'read' : ''}">${msg.readBy && msg.readBy.length > 1 ? '👀' : '✓✓'}</span>` : ''}
      </div>
      ${reactionBadgeHtml}
    </div>
  `;

  let pressTimer;
  el.addEventListener('pointerdown', (e) => {
    pressTimer = setTimeout(() => {
      showEmojiPicker(msg._id, el, isSent);
    }, 500); // 500ms long press
  });
  el.addEventListener('pointerup', () => clearTimeout(pressTimer));
  el.addEventListener('pointerleave', () => clearTimeout(pressTimer));
  el.addEventListener('contextmenu', (e) => {
    // on mobile, long press might trigger contextmenu
    if (pressTimer) {
      clearTimeout(pressTimer);
      e.preventDefault();
      showEmojiPicker(msg._id, el, isSent);
    }
  });

  el.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearTimeout(pressTimer);
    addReaction(msg._id, '❤️');
    showFloatingHeart(e.clientX, e.clientY);
  });

  container.appendChild(el);
}

// ── Reactions Logic ──
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function showEmojiPicker(messageId, element, isSent) {
  let picker = document.getElementById('emoji-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'emoji-picker';
    picker.className = 'emoji-picker floating-glass';
    document.body.appendChild(picker);
  }

  picker.innerHTML = EMOJIS.map(emoji => 
    `<button class="emoji-btn" onclick="addReaction('${messageId}', '${emoji}'); document.getElementById('emoji-picker').classList.remove('active')">${emoji}</button>`
  ).join('');

  const rect = element.getBoundingClientRect();
  picker.style.top = `${Math.max(10, rect.top - 50)}px`;
  picker.style.left = `${isSent ? (rect.right - 180) : rect.left}px`;
  picker.classList.add('active');

  // Close when clicking outside
  setTimeout(() => {
    const closePicker = (e) => {
      if (!picker.contains(e.target)) {
        picker.classList.remove('active');
        document.removeEventListener('click', closePicker);
      }
    };
    document.addEventListener('click', closePicker);
  }, 100);
}

function addReaction(messageId, emoji) {
  socket.emit('add-reaction', { roomId: currentRoomId, messageId, emoji });
}

function showFloatingHeart(x, y) {
  const heart = document.createElement('div');
  heart.className = 'floating-heart';
  heart.textContent = '❤️';
  heart.style.left = `${x}px`;
  heart.style.top = `${y}px`;
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 1000);
}

function updateMessageReactions(messageId, reactions) {
  const el = document.querySelector(`.message-wrapper[data-message-id="${messageId}"] .message-reactions-list`);
  if (!el) return;
  
  if (reactions && reactions.length > 0) {
    el.innerHTML = reactions.map(r => `<span class="reaction-item" data-emoji="${r.emoji}">${r.emoji}</span>`).join('');
  } else {
    el.innerHTML = '';
  }
}

function formatMessageContent(content) {
  let text = escapeHtml(content);
  // Convert URLs to links
  text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Convert newlines
  text = text.replace(/\n/g, '<br>');
  return text;
}

function appendDateSeparator(dateStr) {
  const container = document.getElementById('messages-container');
  const el = document.createElement('div');
  el.className = 'date-separator';
  el.innerHTML = `<span>${formatDateSeparator(dateStr)}</span>`;
  container.appendChild(el);
}

function scrollToBottom(smooth = true) {
  const container = document.getElementById('messages-container');
  setTimeout(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, 50);
}

// ── Send Message ──
function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  
  if (!content || !currentRoomId) return;

  socket.emit('send-message', {
    roomId: currentRoomId,
    content,
    type: 'text',
  });

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  // Stop typing
  if (isTyping) {
    socket.emit('stop-typing', { roomId: currentRoomId });
    isTyping = false;
  }
}

// ── Update Room in Sidebar ──
function updateRoomInSidebar(roomId, message) {
  const room = rooms.find(r => r._id === roomId);
  if (room) {
    room.lastMessage = {
      content: message.content,
      sender: message.sender,
      createdAt: message.createdAt,
    };
    room.updatedAt = message.createdAt;
    renderRoomList();
  }
}

// ── Online Status Updates ──
function updateOnlineStatuses() {
  document.querySelectorAll('.room-item').forEach(el => {
    const roomId = el.dataset.roomId;
    const room = rooms.find(r => r._id === roomId);
    if (room && room.type === 'direct') {
      const other = getOtherUser(room);
      if (other) {
        const dot = el.querySelector('.status-dot');
        if (dot) {
          dot.className = `status-dot ${onlineUserIds.has(other._id) ? 'online' : 'offline'}`;
        }
      }
    }
  });
}

function updateChatHeaderStatus() {
  if (!currentRoomId) return;
  const room = rooms.find(r => r._id === currentRoomId);
  if (!room) return;

  const statusEl = document.getElementById('chat-status');
  if (room.type === 'direct') {
    const other = getOtherUser(room);
    if (other && onlineUserIds.has(other._id)) {
      statusEl.textContent = '● Online';
      statusEl.className = 'chat-header-status';
    } else {
      statusEl.textContent = '○ Offline';
      statusEl.className = 'chat-header-status offline';
    }
  } else {
    const onlineCount = room.members?.filter(m => onlineUserIds.has(m._id)).length || 0;
    statusEl.textContent = `${room.members?.length || 0} members, ${onlineCount} online`;
    statusEl.className = 'chat-header-status';
  }
}

// ── Typing Indicator ──
function showTypingIndicator(name) {
  const indicator = document.getElementById('typing-indicator');
  document.getElementById('typing-text').textContent = `${name} is typing...`;
  indicator.classList.add('active');
}

function hideTypingIndicator() {
  document.getElementById('typing-indicator').classList.remove('active');
}

// ═══════════════════════════════════════════════════
// NEW CHAT MODAL
// ═══════════════════════════════════════════════════
function openNewChatModal() {
  document.getElementById('new-chat-modal').classList.add('active');
  document.getElementById('user-search-input').value = '';
  document.getElementById('user-search-input').focus();
}

function closeNewChatModal() {
  document.getElementById('new-chat-modal').classList.remove('active');
}

async function searchUsers(query) {
  const container = document.getElementById('user-search-results');
  
  if (query.length < 2) {
    container.innerHTML = '<div class="empty-rooms" style="padding:2rem;"><p style="font-size:0.85rem;color:var(--text-muted);">Type at least 2 characters to search</p></div>';
    return;
  }

  try {
    const data = await api(`/api/rooms/search-users?q=${encodeURIComponent(query)}`);
    
    if (data.users.length === 0) {
      container.innerHTML = '<div class="empty-rooms" style="padding:2rem;"><p style="font-size:0.85rem;color:var(--text-muted);">No users found</p></div>';
      return;
    }

    container.innerHTML = '';
    data.users.forEach(user => {
      const el = document.createElement('div');
      el.className = 'user-search-item';
      el.innerHTML = `
        <img src="${escapeHtml(user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=0a0a2e&color=00f5ff&size=64`)}" alt="">
        <div>
          <div class="user-name">${escapeHtml(user.displayName)}</div>
          <div class="user-detail">${escapeHtml(user.phone || user.email || '')}</div>
        </div>
      `;
      el.addEventListener('click', () => startDirectChat(user._id));
      container.appendChild(el);
    });
  } catch (error) {
    console.error('Search error:', error);
  }
}

async function startDirectChat(userId) {
  try {
    const data = await api('/api/rooms', {
      method: 'POST',
      body: { type: 'direct', memberIds: [userId] },
    });

    const room = data.room;
    
    // Add to rooms if new
    if (!rooms.find(r => r._id === room._id)) {
      rooms.unshift(room);
      renderRoomList();
    }

    // Select the room
    selectRoom(room._id);
    closeNewChatModal();

    // Notify via socket for real-time sync
    if (!data.existing) {
      socket.emit('join-room', { roomId: room._id });
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ═══════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════
function initEventListeners() {
  // Message input
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');

  messageInput.addEventListener('input', () => {
    // Auto-resize textareax
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    
    // Enable/disable send button
    sendBtn.disabled = !messageInput.value.trim();

    // Typing indicator
    if (currentRoomId) {
      if (!isTyping) {
        isTyping = true;
        socket.emit('typing', { roomId: currentRoomId });
      }
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('stop-typing', { roomId: currentRoomId });
      }, 2000);
    }
  });

  // Send on Enter (Shift+Enter for newline)
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Send button click
  sendBtn.addEventListener('click', sendMessage);

  // Emoji button click
  const emojiBtn = document.getElementById('emoji-btn');
  if (emojiBtn) {
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let picker = document.getElementById('input-emoji-picker');
      if (!picker) {
        picker = document.createElement('div');
        picker.id = 'input-emoji-picker';
        picker.className = 'emoji-picker floating-glass';
        document.body.appendChild(picker);
        
        // Define emojis
        const INPUT_EMOJIS = ['😀', '😂', '😍', '😭', '😎', '👍', '🔥', '🎉', '❤️', '🙄'];
        picker.innerHTML = INPUT_EMOJIS.map(emoji => 
          `<button class="emoji-btn">${emoji}</button>`
        ).join('');
        
        // Attach handlers to insert into input
        picker.querySelectorAll('.emoji-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            messageInput.value += btn.textContent;
            messageInput.focus();
            picker.classList.remove('active');
          });
        });
      }
      
      if (picker.classList.contains('active')) {
        picker.classList.remove('active');
        return;
      }
      
      const rect = emojiBtn.getBoundingClientRect();
      picker.style.bottom = `${window.innerHeight - rect.top + 10}px`;
      picker.style.top = 'auto'; // override default top
      picker.style.right = `${window.innerWidth - rect.right}px`;
      picker.style.left = 'auto'; // override default left
      
      // Fix potential display bug overriding previous class styles
      picker.style.position = 'fixed';
      picker.style.flexWrap = 'wrap';
      picker.style.maxWidth = '200px';
      
      picker.classList.add('active');
      
      // Close when clicking outside
      setTimeout(() => {
        const closePicker = (evt) => {
          if (!picker.contains(evt.target) && evt.target !== emojiBtn) {
            picker.classList.remove('active');
            document.removeEventListener('click', closePicker);
          }
        };
        document.addEventListener('click', closePicker);
      }, 100);
    });
  }

  // Media buttons
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Media sharing coming in the next phase! 📸', 'info');
    });
  });

  // Scroll to bottom button
  const messagesContainer = document.getElementById('messages-container');
  const scrollBtn = document.getElementById('scroll-bottom-btn');

  messagesContainer.addEventListener('scroll', () => {
    const atBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
    scrollBtn.classList.toggle('visible', !atBottom);
  });

  scrollBtn.addEventListener('click', () => scrollToBottom());

  // Search rooms
  document.getElementById('search-rooms').addEventListener('input', debounce((e) => {
    renderRoomList(e.target.value);
  }, 300));

  // New chat buttons
  document.getElementById('new-chat-btn').addEventListener('click', openNewChatModal);
  document.getElementById('start-chat-btn')?.addEventListener('click', openNewChatModal);
  document.getElementById('welcome-new-chat-btn')?.addEventListener('click', openNewChatModal);
  document.getElementById('close-modal-btn').addEventListener('click', closeNewChatModal);

  // Modal overlay click to close
  document.getElementById('new-chat-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeNewChatModal();
  });

  // User search in modal
  document.getElementById('user-search-input').addEventListener('input', debounce((e) => {
    searchUsers(e.target.value);
  }, 400));

  // Mobile back button
  document.getElementById('mobile-back-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('hidden-mobile');
    currentRoomId = null;
    document.getElementById('welcome-screen').classList.remove('hidden');
    document.getElementById('active-chat').classList.add('hidden');
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (socket) socket.disconnect();
    clearAuth();
    navigateTo('/');
  });

    // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNewChatModal();
  });
  
  // Mood Selector
  const moodSelector = document.getElementById('mood-selector');
  if (moodSelector) {
    moodSelector.addEventListener('change', (e) => {
      const mood = e.target.value;
      document.documentElement.setAttribute('data-mood', mood);
      localStorage.setItem('nexa-mood', mood);
    });
  }

  // Room Theme Selector
  const themeSelector = document.getElementById('room-theme-selector');
  if (themeSelector) {
    themeSelector.addEventListener('change', (e) => {
      if (!currentRoomId) return;
      const theme = e.target.value;
      socket.emit('update-room-theme', { roomId: currentRoomId, theme });
    });
  }
}

function applyRoomTheme(theme) {
  const container = document.getElementById('active-chat');
  if (!container) return;
  const themeSelector = document.getElementById('room-theme-selector');
  if (themeSelector) themeSelector.value = theme;
  
  // Maps themes to CSS variables for background
  const themes = {
    'default': 'transparent',
    'neon-blue': 'linear-gradient(135deg, rgba(0, 245, 255, 0.1) 0%, rgba(10, 10, 46, 0) 100%)',
    'cyber-purple': 'linear-gradient(135deg, rgba(191, 0, 255, 0.1) 0%, rgba(10, 10, 46, 0) 100%)',
    'matrix-green': 'linear-gradient(135deg, rgba(0, 255, 128, 0.1) 0%, rgba(10, 10, 46, 0) 100%)',
  };
  
  container.style.background = themes[theme] || themes['default'];
}
