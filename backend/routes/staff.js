const express = require('express');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('Supervisor'));

// GET /api/staff
router.get('/', async (req, res) => {
  const staff = await User.find().sort({ createdAt: 1 });
  res.json(staff.map((u) => u.toSafeObject()));
});

// POST /api/staff — create a new Pharmacist or Supervisor account
router.post('/', async (req, res) => {
  try {
    const { name, username, role, phone, password } = req.body;
    if (!name || !username || !role) {
      return res.status(400).json({ message: 'Name, username and role are required.' });
    }
    const dupe = await User.findOne({ username: username.trim().toLowerCase() });
    if (dupe) return res.status(409).json({ message: 'That username is already taken.' });

    const user = await User.create({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      role,
      phone: (phone || '').trim(),
      password: password || 'Change@123'
    });
    res.status(201).json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: 'Could not create staff account.', error: err.message });
  }
});

// PUT /api/staff/:id — edit a staff account
router.put('/:id', async (req, res) => {
  try {
    const { name, username, role, phone, password } = req.body;
    const dupe = await User.findOne({ _id: { $ne: req.params.id }, username: (username || '').trim().toLowerCase() });
    if (dupe) return res.status(409).json({ message: 'That username is already taken.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Staff account not found.' });

    if (name) user.name = name.trim();
    if (username) user.username = username.trim().toLowerCase();
    if (role) user.role = role;
    if (phone !== undefined) user.phone = phone.trim();
    if (password) user.password = password;
    await user.save();
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: 'Could not update staff account.', error: err.message });
  }
});

// DELETE /api/staff/:id
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({ message: "You can't delete your own account here — use My Profile instead." });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Staff account not found.' });

    if (target.role === 'Supervisor') {
      const supervisorCount = await User.countDocuments({ role: 'Supervisor' });
      if (supervisorCount <= 1) {
        return res.status(400).json({ message: 'At least one Supervisor account must remain.' });
      }
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Staff account deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete staff account.', error: err.message });
  }
});

module.exports = router;
