require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { socketAuthMiddleware } = require('./middleware/auth');
const { setupSocketHandlers } = require('./socket/handlers');

// Import routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const storyRoutes = require('./routes/stories');

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS for development and production
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5500', /\.netlify\.app$/],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const morgan = require('morgan');

// ──── Middleware ────
app.use(morgan('dev'));
app.use(cors({ 
  origin: ['http://localhost:3000', 'http://localhost:5500', /\.netlify\.app$/],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──── Serve static files ────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ──── API Routes ────
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/stories', storyRoutes);

// ──── Global Error Handler ────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

// ──── Health check ────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ──── SPA fallback ────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'chat.html'));
});

// ──── Socket.IO Auth + Handlers ────
io.use(socketAuthMiddleware);
setupSocketHandlers(io);

// ──── Connect to DB and Start Server ────
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║                                          ║');
    console.log('║   🚀 NexaChat Server Running!            ║');
    console.log(`║   🌐 http://localhost:${PORT}               ║`);
    console.log('║   📡 WebSocket: Ready                    ║');
    console.log('║   🔐 Auth: OTP + Google OAuth            ║');
    console.log('║                                          ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = { app, server, io };
