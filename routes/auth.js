const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @route   GET /api/auth/sessions
// @desc    Get active sessions (for registration selection)
// @access  Public
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find({ status: 'active' }).select('name schedule');
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/register
// @desc    Register a new student
// @access  Public
router.post('/register', async (req, res) => {
  const { name, email, password, sessionId } = req.body;

  try {
    if (!name || !email || !password || !sessionId) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Check if target session is valid and active
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Selected session not found' });
    }
    if (session.status === 'blocked') {
      return res.status(400).json({ message: 'This session is blocked by admin' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (isApproved is false by default)
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'student',
      session: sessionId,
      isApproved: false
    });

    res.status(201).json({
      message: 'Registration successful. Waiting for admin approval.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        session: user.session,
        isApproved: user.isApproved
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).populate('session');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Match password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Role-specific checks
    if (user.role === 'student') {
      if (!user.isApproved) {
        return res.status(403).json({ message: 'Your registration has not been approved by the admin yet' });
      }

      // Check if student's session is blocked
      if (!user.session) {
        return res.status(403).json({ message: 'You are not assigned to any session' });
      }
      if (user.session.status === 'blocked') {
        return res.status(403).json({ message: `Access denied. Your session (${user.session.name}) is blocked.` });
      }
    }

    res.json({
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        session: user.session ? { id: user.session._id, name: user.session.name } : null
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/auth/google/client-id
// @desc    Get Google Client ID config
// @access  Public
router.get('/google/client-id', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

// Helper for Google login validation and DB insertion
const handleGoogleUser = async (email, name, res) => {
  try {
    let user = await User.findOne({ email }).populate('session');

    if (user) {
      // User exists. Verify status.
      if (user.role === 'student') {
        if (!user.isApproved) {
          return res.status(403).json({ message: 'Your Google registration is pending admin approval' });
        }
        if (!user.session) {
          return res.status(403).json({ message: 'You are registered, but not assigned to any session yet. Please contact admin.' });
        }
        if (user.session.status === 'blocked') {
          return res.status(403).json({ message: `Access denied. Your session (${user.session.name}) is blocked.` });
        }
      }

      // Log in
      return res.json({
        token: generateToken(user._id),
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isApproved: user.isApproved,
          session: user.session ? { id: user.session._id, name: user.session.name } : null
        }
      });
    } else {
      // User doesn't exist. Register as pending student.
      const tempPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role: 'student',
        session: null, // Admin will assign
        isApproved: false
      });

      return res.status(201).json({
        message: 'Google registration submitted successfully. Please wait for the admin to approve your account and assign your session.',
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          session: null,
          isApproved: false
        }
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/google
// @desc    Authenticate with real Google ID token
// @access  Public
router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: 'Google ID token is required' });
  }

  try {
    // Validate with Google tokeninfo endpoint
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    const payload = await response.json();

    if (payload.error_description) {
      return res.status(400).json({ message: `Google Token Verification Failed: ${payload.error_description}` });
    }

    const { email, name } = payload;
    await handleGoogleUser(email, name, res);
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ message: 'Internal server verification error' });
  }
});

// @route   POST /api/auth/google/mock
// @desc    Mock Google login for development/testing when GOOGLE_CLIENT_ID is unset
// @access  Public
router.post('/google/mock', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) {
    return res.status(400).json({ message: 'Email and Name are required for mock login' });
  }

  // Security check: Only allow mock login if GOOGLE_CLIENT_ID is not configured in env
  if (process.env.GOOGLE_CLIENT_ID) {
    return res.status(400).json({ message: 'Mock Google Login is disabled in production' });
  }

  await handleGoogleUser(email, name, res);
});

module.exports = router;
