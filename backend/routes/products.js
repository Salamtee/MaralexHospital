const express = require('express');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/products
router.get('/', async (req, res) => {
  const products = await Product.find().sort({ createdAt: 1 });
  res.json(products);
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { name, sku, cat, batch, expiry, qty, reorder, cost, price } = req.body;
    if (!name || !sku || !cat || !batch || !expiry) {
      return res.status(400).json({ message: 'Name, SKU, category, batch and expiry are required.' });
    }
    const dupe = await Product.findOne({ sku: sku.trim() });
    if (dupe) return res.status(409).json({ message: 'That SKU already exists.' });

    const product = await Product.create({
      name: name.trim(),
      sku: sku.trim(),
      cat,
      batch: batch.trim(),
      expiry,
      qty: Number(qty) || 0,
      reorder: Number(reorder) || 10,
      cost: Number(cost) || 0,
      price: Number(price) || 0
    });
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: 'Could not add inventory item.', error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ message: 'Item not found.' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Could not update item.', error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Item not found.' });
  res.json({ message: 'Item deleted.' });
});

module.exports = router;
