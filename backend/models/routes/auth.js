const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth, requireWrite } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '12h'
  });
}

// POST /api/auth/login  { phone, password, role }
router.post('/login', async (req, res) => {
  try {
    const { phone, password, role, username } = req.body;
    // Accept phone (preferred) or legacy username field mapped to phone
    const rawPhone = phone || username;
    if (!rawPhone || !password || !role) {
      return res.status(400).json({ message: 'Phone number, password and role are required.' });
    }

    const normalized = User.normalizePhone(rawPhone);
    const user = await User.findOne({ phone: normalized, role });
    if (!user) {
      return res.status(401).json({ message: 'Invalid phone number, password or role selected.' });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid phone number, password or role selected.' });
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
    const { name, phone } = req.body;
    if (phone !== undefined && phone !== null && String(phone).trim()) {
      const normalized = User.normalizePhone(phone);
      if (!normalized || normalized.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ message: 'Enter a valid phone number.' });
      }
      const dupe = await User.findOne({
        _id: { $ne: req.user._id },
        phone: normalized
      });
      if (dupe) return res.status(409).json({ message: 'That phone number is already registered.' });
      req.user.phone = normalized;
    }
    if (name) req.user.name = name.trim();
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
router.delete('/me', requireAuth, requireWrite, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete account.', error: err.message });
  }
});


// POST /api/auth/avatar — upload profile image
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose an image file.' });
    req.user.avatar = req.file.filename;
    await req.user.save();
    res.json({ user: req.user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ message: 'Could not upload avatar.', error: err.message });
  }
});

module.exports = router;

