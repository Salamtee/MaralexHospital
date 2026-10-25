const express = require('express');
const Adjustment = require('../models/Adjustment');
const Product = require('../models/Product');
const { requireAuth, requireWrite, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return requireWrite(req, res, next);
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/', async (req, res) => {
  const adjustments = await Adjustment.find().sort({ createdAt: -1 });
  res.json(adjustments);
});

// POST /api/adjustments  { productId, type, qty, reason, reorderDate? }
router.post('/', async (req, res) => {
  try {
    const { productId, type, qty, reason, reorderDate } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Item not found.' });
    const amount = Number(qty);
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Enter a valid quantity.' });
    if (!reason) return res.status(400).json({ message: 'A reason is required.' });

    if (type === 'Damaged') {
      product.qty = Math.max(0, product.qty - amount);
    } else {
      product.qty += amount;
    }
    if (reorderDate) product.reorderDate = reorderDate;
    await product.save();

    const adjustment = await Adjustment.create({
      date: todayISO(),
      item: product.name,
      product: product._id,
      type,
      qty: amount,
      reason,
      reorderDate: reorderDate || '',
      adjustedBy: req.user._id
    });
    res.status(201).json({ adjustment, product });
  } catch (err) {
    res.status(500).json({ message: 'Could not record adjustment.', error: err.message });
  }
});

// DELETE /api/adjustments/:id — remove one adjustment record (Supervisor only).
// This only removes the history entry; current stock quantities are not changed.
router.delete('/:id', requireRole('Supervisor'), async (req, res) => {
  try {
    const removed = await Adjustment.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ message: 'Adjustment record not found.' });
    await logAudit({
      action: 'DELETE',
      entity: 'Adjustment',
      entityId: removed._id,
      summary: `Deleted stock adjustment record for ${removed.item} (${removed.type} ${removed.qty})`,
      user: req.user,
      req
    });
    res.json({ message: 'Adjustment record deleted.', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete adjustment record.', error: err.message });
  }
});

// DELETE /api/adjustments — clear ALL adjustment records (Supervisor only)
router.delete('/', requireRole('Supervisor'), async (req, res) => {
  try {
    const result = await Adjustment.deleteMany({});
    await logAudit({
      action: 'DELETE',
      entity: 'Adjustment',
      summary: `Cleared stock adjustment history (${result.deletedCount} records removed)`,
      user: req.user,
      req
    });
    res.json({ message: `Cleared ${result.deletedCount} adjustment records.` });
  } catch (err) {
    res.status(500).json({ message: 'Could not clear adjustment records.', error: err.message });
  }
});

module.exports = router;
