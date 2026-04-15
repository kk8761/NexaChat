# 🚀 NexaChat — Real-Time Chat Application

A futuristic, production-ready real-time chat application with WebSocket messaging, OTP authentication, and Google OAuth.

![NexaChat](https://img.shields.io/badge/NexaChat-Futuristic%20Chat-00f5ff?style=for-the-badge)

## ✨ Features

- 🌐 **Real-time messaging** via WebSocket (Socket.IO)
- 📱 **Phone OTP authentication** (demo mode + Twilio-ready)
- 🔑 **Google OAuth** sign-in
- 👥 **Concurrent multi-user** support
- 💬 **Direct & group chats**
- ✅ **Read receipts** and typing indicators
- 🟢 **Online/offline presence** tracking
- 🔍 **User search** to start new conversations
- 📱 **Responsive** mobile-friendly design
- 🎨 **Futuristic dark theme** with glassmorphism & neon accents

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.IO, Mongoose
- **Database**: MongoDB (Atlas / local / in-memory)
- **Auth**: JWT, OTP, Google OAuth 2.0
- **Frontend**: Vanilla HTML, CSS, JavaScript

## 🚀 Quick Start (Local Development)

### 1. Clone and Install

```bash
cd server
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

> **Note:** For local development, the app includes an **in-memory MongoDB** fallback so you don't need to install MongoDB.

### 3. Start the Server

```bash
npm start
```

Open http://localhost:3000 — that's it! 🎉

## 🔐 Authentication Setup

### Phone OTP (Demo Mode)

The app starts in **demo mode** by default. OTPs are displayed on screen instead of being sent via SMS. This is perfect for testing and development.

To switch to real SMS:
1. Create a [Twilio](https://www.twilio.com/) account
2. Update `.env`:
   ```
   OTP_MODE=twilio
   TWILIO_ACCOUNT_SID=your-sid
   TWILIO_AUTH_TOKEN=your-token
   TWILIO_PHONE_NUMBER=+1234567890
   ```
3. Uncomment the Twilio code in `server/routes/auth.js`

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Go to **APIs & Services** → **Credentials**
4. Create an **OAuth 2.0 Client ID** (Web application)
5. Add your domain to Authorized JavaScript origins
6. Copy the Client ID to `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

## 🌍 Deployment

### Option 1: Railway (Recommended, Free Tier)

1. Push your code to GitHub
2. Go to [Railway](https://railway.app/)
3. Create a new project → Deploy from GitHub
4. Add a MongoDB plugin (Railway provides one)
5. Set environment variables:
   - `MONGODB_URI` (from Railway's MongoDB plugin)
   - `JWT_SECRET` (generate a strong random string)
   - `PORT` = 3000
   - `OTP_MODE` = demo
6. Deploy! Railway will give you a public URL

### Option 2: Render (Free Tier)

1. Push your code to GitHub
2. Go to [Render](https://render.com/)
3. Create a new **Web Service** → Connect GitHub repo
4. Set:
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && npm start`
5. Add environment variables in Render dashboard
6. Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier for the database

### Option 3: VPS (Digital Ocean, AWS, etc.)

```bash
# Clone your repo on the server
git clone your-repo-url
cd your-repo/server

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
nano .env  # Edit with your values

# Install PM2 for process management
npm install -g pm2

# Start with PM2 (auto-restart on crash)
pm2 start server.js --name nexachat
pm2 save
pm2 startup
```

### MongoDB Atlas Setup (Free Tier)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free **M0 Sandbox** cluster
3. Create a database user (username/password)
4. Whitelist your IP (or use `0.0.0.0/0` for all IPs)
5. Copy the connection string to your `.env` as `MONGODB_URI`

## 📁 Project Structure

```
├── server/
│   ├── server.js          # Express + Socket.IO entry
│   ├── config/db.js       # MongoDB connection
│   ├── models/            # Mongoose schemas
│   ├── routes/            # REST API routes
│   ├── middleware/         # JWT auth middleware
│   └── socket/            # Socket.IO event handlers
├── public/
│   ├── index.html         # Login page
│   ├── chat.html          # Chat interface
│   ├── css/               # Stylesheets
│   └── js/                # Client-side logic
└── README.md
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MONGODB_URI` | MongoDB connection string | Yes* |
| `JWT_SECRET` | Secret for JWT tokens | Yes |
| `PORT` | Server port (default: 3000) | No |
| `OTP_MODE` | `demo` or `twilio` | No |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Only if OTP_MODE=twilio |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Only if OTP_MODE=twilio |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | Only if OTP_MODE=twilio |

*Falls back to in-memory MongoDB if not set

## 📄 License

MIT License
