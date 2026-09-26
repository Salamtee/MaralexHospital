const express = require('express');
const Adjustment = require('../models/Adjustment');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/', async (req, res) => {
  const adjustments = await Adjustment.find().sort({ createdAt: -1 });
  res.json(adjustments);
});

// POST /api/adjustments  { productId, type, qty, reason }
router.post('/', async (req, res) => {
  try {
    const { productId, type, qty, reason } = req.body;
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
    await product.save();

    const adjustment = await Adjustment.create({
      date: todayISO(),
      item: product.name,
      product: product._id,
      type,
      qty: amount,
      reason,
      adjustedBy: req.user._id
    });
    res.status(201).json({ adjustment, product });
  } catch (err) {
    res.status(500).json({ message: 'Could not record adjustment.', error: err.message });
  }
});

module.exports = router;
