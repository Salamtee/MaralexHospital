const express = require('express');
const AuditLog = require('../models/AuditLog');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('Supervisor', 'Owner'));

// GET /api/audit  — Supervisor sees all; Pharmacist sees own (or all for transparency)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.action) filter.action = req.query.action;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) {
        const end = new Date(req.query.to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }
    // Optional: limit pharmacists to their own logs
    // if (req.user.role !== 'Supervisor') filter.userId = req.user._id;

    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Could not load audit log.', error: err.message });
  }
});

// DELETE /api/audit  — clear old logs (Supervisor only)
router.delete('/', requireRole('Supervisor'), async (req, res) => {
  try {
    const days = Number(req.query.olderThanDays) || 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    res.json({ message: `Deleted ${result.deletedCount} log entries older than ${days} days.` });
  } catch (err) {
    res.status(500).json({ message: 'Could not clear logs.', error: err.message });
  }
});

module.exports = router;
