const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  });
}

// POST /api/auth/login  { username, password, role }
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'Username, password and role are required.' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase(), role });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username, password or role selected.' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid username, password or role selected.' });
    }

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
});

// GET /api/auth/me — resume session
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

// PUT /api/auth/profile — update own name/username/phone
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, username, phone } = req.body;
    const dupe = await User.findOne({
      _id: { $ne: req.user._id },
      username: (username || '').trim().toLowerCase()
    });
    if (dupe) return res.status(409).json({ message: 'That username is already taken.' });

    req.user.name = (name || req.user.name).trim();
    req.user.username = (username || req.user.username).trim().toLowerCase();
    req.user.phone = phone !== undefined ? phone.trim() : req.user.phone;
    await req.user.save();
    res.json({ user: req.user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Could not update profile.', error: err.message });
  }
});

// PUT /api/auth/password — change own password
router.put('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const match = await req.user.comparePassword(currentPassword || '');
    if (!match) return res.status(401).json({ message: 'Current password is incorrect.' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }
    req.user.password = newPassword;
    await req.user.save();
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not update password.', error: err.message });
  }
});

// DELETE /api/auth/me — delete own account
router.delete('/me', requireAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete account.', error: err.message });
  }
});

module.exports = router;
