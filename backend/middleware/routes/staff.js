const express = require('express');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth, requireRole('Supervisor'));

// GET /api/staff
router.get('/', async (req, res) => {
  const staff = await User.find().sort({ createdAt: 1 });
  res.json(staff.map((u) => u.toSafeObject()));
});

// POST /api/staff — create Pharmacist or Supervisor (login = phone + password)
router.post('/', async (req, res) => {
  try {
    const { name, role, phone, password, username } = req.body;
    if (!name || !role || !phone) {
      return res.status(400).json({ message: 'Name, phone number and role are required.' });
    }
    if (!['Pharmacist', 'Supervisor'].includes(role)) {
      return res.status(400).json({
        message: 'Staff role must be Pharmacist or Supervisor. Owner accounts are seeded only.'
      });
    }

    const normalized = User.normalizePhone(phone);
    if (!normalized || normalized.replace(/\D/g, '').length < 7) {
      return res.status(400).json({ message: 'Enter a valid phone number.' });
    }

    const dupe = await User.findOne({ phone: normalized });
    if (dupe) return res.status(409).json({ message: 'That phone number is already registered.' });

    const user = await User.create({
      name: name.trim(),
      username: (username || normalized).toString().trim().toLowerCase().replace(/[^\w]/g, '') || normalized,
      role,
      phone: normalized,
      password: password || 'Change@123'
    });
    res.status(201).json(user.toSafeObject());
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'That phone number is already registered.' });
    }
    res.status(500).json({ message: 'Could not create staff account.', error: err.message });
  }
});

// PUT /api/staff/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, role, phone, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Staff account not found.' });

    // Supervisors may manage the Owner's name, phone number and password,
    // but the Owner's role itself can never be changed here.
    const isOwnerAccount = user.role === 'Owner';
    const changes = [];

    if (name) {
      if (user.name !== name.trim()) changes.push('name');
      user.name = name.trim();
    }
    if (role && !isOwnerAccount) {
      if (!['Pharmacist', 'Supervisor'].includes(role)) {
        return res.status(400).json({ message: 'Staff role must be Pharmacist or Supervisor.' });
      }
      user.role = role;
    }
    if (phone !== undefined && phone !== null && String(phone).trim()) {
      const normalized = User.normalizePhone(phone);
      if (!normalized || normalized.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ message: 'Enter a valid phone number.' });
      }
      const dupe = await User.findOne({ _id: { $ne: user._id }, phone: normalized });
      if (dupe) return res.status(409).json({ message: 'That phone number is already registered.' });
      if (user.phone !== normalized) changes.push('phone number');
      user.phone = normalized;
    }
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      }
      user.password = password;
      changes.push('password');
    }
    await user.save();

    if (isOwnerAccount) {
      await logAudit({
        action: 'UPDATE',
        entity: 'User',
        entityId: user._id,
        summary: `Supervisor updated Owner account (${changes.join(', ') || 'no changes'})`,
        user: req.user,
        req
      });
    }
    res.json(user.toSafeObject());
  } catch (err) {
    res.status(500).json({ message: 'Could not update staff account.', error: err.message });
  }
});

// DELETE /api/staff/:id
router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === String(req.user._id)) {
      return res.status(400).json({
        message: "You can't delete your own account here — use My Profile instead."
      });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Staff account not found.' });
    if (target.role === 'Owner') {
      return res.status(403).json({ message: 'Owner accounts cannot be deleted here.' });
    }
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
