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

module.exports = router;
