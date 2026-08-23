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

// Helper for redirecting authenticated Google user
const handleGoogleRedirectUser = async (email, name, res, req) => {
  try {
    let user = await User.findOne({ email }).populate('session');
    const frontendOrigin = `${req.protocol}://${req.get('host')}`;

    if (user) {
      // User exists. Verify role and status.
      if (user.role === 'student') {
        if (!user.isApproved) {
          return res.redirect(`${frontendOrigin}/index.html?error=${encodeURIComponent('Your Google registration is pending admin approval')}`);
        }
        if (!user.session) {
          return res.redirect(`${frontendOrigin}/index.html?error=${encodeURIComponent('You are registered, but not assigned to any session yet. Please contact admin.')}`);
        }
        if (user.session.status === 'blocked') {
          return res.redirect(`${frontendOrigin}/index.html?error=${encodeURIComponent(`Access denied. Your session (${user.session.name}) is blocked.`)}`);
        }
      }

      // Successful login redirect with parameters
      const token = generateToken(user._id);
      return res.redirect(`${frontendOrigin}/index.html?token=${token}&role=${user.role}&username=${encodeURIComponent(user.name)}`);
    } else {
      // User doesn't exist. Create pending student.
      const tempPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      await User.create({
        name,
        email,
        password: hashedPassword,
        role: 'student',
        session: null,
        isApproved: false
      });

      return res.redirect(`${frontendOrigin}/index.html?success=${encodeURIComponent('Google registration submitted successfully. Please wait for the admin to approve your account.')}`);
    }
  } catch (error) {
    console.error('Error redirecting Google user:', error);
    res.status(500).send('Internal error handling Google redirect');
  }
};

// Helper for Google login validation in mock API mode
const handleGoogleMockUser = async (email, name, res) => {
  try {
    let user = await User.findOne({ email }).populate('session');

    if (user) {
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
      const tempPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role: 'student',
        session: null,
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

// @route   GET /api/auth/google/login
// @desc    Redirect to Google OAuth consent page
// @access  Public
router.get('/google/login', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).send('Google OAuth client configuration (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) is missing in server env variables.');
  }

  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${
    process.env.GOOGLE_CLIENT_ID
  }&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=profile%20email&prompt=select_account`;

  res.redirect(googleAuthUrl);
});

// @route   GET /api/auth/google/callback
// @desc    OAuth callback that handles authorization codes
// @access  Public
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Authorization code is missing');
  }

  try {
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

    // Exchange auth code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      console.error('Google token exchange error:', tokenData);
      return res.status(400).send('Google OAuth code exchange failed');
    }

    // Fetch user profile info
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.status(400).send('Unable to retrieve email from Google login');
    }

    await handleGoogleRedirectUser(profile.email, profile.name || profile.email.split('@')[0], res, req);
  } catch (error) {
    console.error('Google OAuth callback handler error:', error);
    res.status(500).send('Internal server callback error');
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

  // Disable mock login if GOOGLE_CLIENT_ID is configured in env
  if (process.env.GOOGLE_CLIENT_ID) {
    return res.status(400).json({ message: 'Mock Google Login is disabled in production' });
  }

  await handleGoogleMockUser(email, name, res);
});

module.exports = router;
