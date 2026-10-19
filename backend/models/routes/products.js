const express = require('express');
const Product = require('../models/Product');
const { requireAuth, requireWrite } = require('../middleware/auth');
const { notifySupervisorsAndOwners } = require('../utils/notify');
const Adjustment = require('../models/Adjustment');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return requireWrite(req, res, next);
});

const CAT_PREFIX = {
  Medicines: 'MED',
  'Medical Supplies': 'SUP',
  Laboratory: 'LAB',
  Equipment: 'EQP'
};

async function nextSku(cat) {
  const prefix = CAT_PREFIX[cat] || 'ITM';
  const re = new RegExp('^' + prefix + '-(\\d+)$', 'i');
  const existing = await Product.find({ sku: new RegExp('^' + prefix + '-', 'i') }).select('sku');
  let max = 0;
  for (const p of existing) {
    const m = String(p.sku).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

router.get('/', async (req, res) => {
  const products = await Product.find().sort({ createdAt: 1 });
  res.json(products);
});

// Preview next SKU for a category
router.get('/next-sku', async (req, res) => {
  try {
    const cat = req.query.cat || 'Medicines';
    const sku = await nextSku(cat);
    res.json({ sku, cat });
  } catch (err) {
    res.status(500).json({ message: 'Could not generate SKU.', error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, cat, batch, expiry, qty, reorder, cost, price } = req.body;
    if (!name || !cat || !batch || !expiry) {
      return res.status(400).json({ message: 'Name, category, batch and expiry are required.' });
    }

    let sku = (req.body.sku || '').trim();
    if (!sku) sku = await nextSku(cat);

    const dupe = await Product.findOne({ sku });
    if (dupe) {
      sku = await nextSku(cat);
    }

    const product = await Product.create({
      name: name.trim(),
      sku,
      cat,
      batch: batch.trim(),
      expiry,
      qty: Number(qty) || 0,
      reorder: Number(reorder) || 10,
      cost: Number(cost) || 0,
      price: Number(price) || 0
    });

    if (product.qty <= product.reorder) {
      notifySupervisorsAndOwners({
        title: 'Low stock item added',
        body: `${product.name} (${product.sku}) — qty ${product.qty}`,
        url: '/?page=inventory',
        tag: 'low-' + product._id
      }).catch(() => {});
    }

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: 'Could not add inventory item.', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ message: 'Item not found.' });

    if (product.qty <= product.reorder) {
      notifySupervisorsAndOwners({
        title: 'Low stock alert',
        body: `${product.name} (${product.sku}) — only ${product.qty} left`,
        url: '/?page=inventory',
        tag: 'low-' + product._id
      }).catch(() => {});
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Could not update item.', error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Item not found.' });
  res.json({ message: 'Item deleted.' });
});

module.exports = router;
