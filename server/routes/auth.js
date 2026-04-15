const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ────────────────────────────────────────
// POST /api/auth/send-otp
// ────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: 'Valid phone number is required.' });
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');

    // Rate limit: max 1 OTP per 60 seconds per phone
    const recentOtp = await Otp.findOne({
      phone: cleanPhone,
      createdAt: { $gt: new Date(Date.now() - 60000) },
    });

    if (recentOtp) {
      return res.status(429).json({ error: 'Please wait 60 seconds before requesting a new OTP.' });
    }

    // Delete old OTPs for this phone
    await Otp.deleteMany({ phone: cleanPhone });

    // Generate new OTP
    const code = generateOTP();
    const otp = new Otp({
      phone: cleanPhone,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
    });
    await otp.save();

    // Demo mode: return OTP in response
    // Production: send via Twilio/SMS API
    const response = { message: 'OTP sent successfully!', phone: cleanPhone };
    
    if (process.env.OTP_MODE && process.env.OTP_MODE.trim() === 'demo') {
      response.demoOtp = code; // Only in demo mode!
      response.note = 'Demo mode: OTP shown here. In production, it will be sent via SMS.';
    }

    // TODO: Production SMS sending
    // if (process.env.OTP_MODE === 'twilio') {
    //   const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    //   await twilio.messages.create({
    //     body: `Your NexaChat verification code is: ${code}`,
    //     from: process.env.TWILIO_PHONE_NUMBER,
    //     to: `+${cleanPhone}`,
    //   });
    // }

    res.json(response);
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// ────────────────────────────────────────
// POST /api/auth/verify-otp
// ────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, displayName } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Phone and OTP code are required.' });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // Find valid OTP
    const otp = await Otp.findOne({
      phone: cleanPhone,
      expiresAt: { $gt: new Date() },
      verified: false,
    });

    if (!otp) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new one.' });
    }

    // Check attempts
    if (otp.attempts >= 5) {
      await Otp.deleteOne({ _id: otp._id });
      return res.status(400).json({ error: 'Too many attempts. Request a new OTP.' });
    }

    // Verify code
    if (otp.code !== code) {
      otp.attempts += 1;
      await otp.save();
      return res.status(400).json({ error: 'Invalid OTP code.', attemptsLeft: 5 - otp.attempts });
    }

    // Mark as verified
    otp.verified = true;
    await otp.save();

    // Find or create user
    let user = await User.findOne({ phone: cleanPhone });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        phone: cleanPhone,
        displayName: displayName || `User${cleanPhone.slice(-4)}`,
      });
      await user.save();
    }

    // Generate JWT
    const token = generateToken(user._id);

    // Clean up used OTP
    await Otp.deleteMany({ phone: cleanPhone });

    res.json({
      token,
      user: {
        _id: user._id,
        phone: user.phone,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
      },
      isNewUser,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP.' });
  }
});

// ────────────────────────────────────────
// GET /api/auth/google/client-id
// ────────────────────────────────────────
router.get('/google/client-id', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// ────────────────────────────────────────
// POST /api/auth/google
// ────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required.' });
    }

    // Verify Google token
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        googleId,
        email,
        displayName: name,
        avatar: picture,
      });
      await user.save();
    } else if (!user.googleId) {
      // Link Google to existing email account
      user.googleId = googleId;
      if (picture && !user.avatar) user.avatar = picture;
      await user.save();
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        bio: user.bio,
      },
      isNewUser,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Google authentication failed.' });
  }
});

// ────────────────────────────────────────
// GET /api/auth/me
// ────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user });
});

// ────────────────────────────────────────
// PUT /api/auth/profile
// ────────────────────────────────────────
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { displayName, bio, avatar } = req.body;
    const updates = {};
    
    if (displayName) updates.displayName = displayName.trim().slice(0, 50);
    if (bio !== undefined) updates.bio = bio.trim().slice(0, 200);
    if (avatar) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

module.exports = router;
