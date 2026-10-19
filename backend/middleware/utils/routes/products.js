const express = require('express');
const Product = require('../models/Product');
const { requireAuth, requireWrite, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
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

// Only Supervisors may add or edit inventory items (Pharmacists can view, sell and adjust stock)
router.post('/', requireRole('Supervisor'), async (req, res) => {
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
      price: Number(price) || 0,
      reorderDate: req.body.reorderDate || null
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

router.put('/:id', requireRole('Supervisor'), async (req, res) => {
  try {
    // Whitelist editable fields. SKU is fixed. Supervisors may also edit the
    // quantity directly; any change is recorded as a stock adjustment + audit entry.
    const allowed = ['name', 'cat', 'batch', 'expiry', 'reorder', 'cost', 'price', 'reorderDate'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.name !== undefined) update.name = String(update.name).trim();
    if (update.batch !== undefined) update.batch = String(update.batch).trim();
    ['reorder', 'cost', 'price'].forEach((k) => { if (update[k] !== undefined) update[k] = Number(update[k]) || 0; });
    if (update.reorderDate === '') update.reorderDate = null;

    // Quantity edit (Supervisor only - route is already restricted)
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Item not found.' });
    const oldQty = existing.qty;
    let newQty = oldQty;
    if (req.body.qty !== undefined && req.body.qty !== '' && req.body.qty !== null) {
      newQty = Number(req.body.qty);
      if (!Number.isInteger(newQty) || newQty < 0) {
        return res.status(400).json({ message: 'Quantity must be a whole number of 0 or more.' });
      }
      update.qty = newQty;
    }

    const product = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!product) return res.status(404).json({ message: 'Item not found.' });

    if (newQty !== oldQty) {
      const diff = newQty - oldQty;
      await Adjustment.create({
        date: new Date().toISOString().slice(0, 10),
        item: product.name,
        product: product._id,
        type: diff > 0 ? 'Correction' : 'Damaged',
        qty: Math.abs(diff),
        reason: (req.body.qtyReason || '').trim() || `Quantity edited by Supervisor (${oldQty} -> ${newQty})`,
        adjustedBy: req.user._id
      });
    }

    logAudit({
      action: 'update',
      entity: 'Product',
      entityId: product._id,
      summary: newQty !== oldQty
        ? `Edited item ${product.name} (${product.sku}); quantity ${oldQty} -> ${newQty}`
        : `Edited item ${product.name} (${product.sku})`,
      details: newQty !== oldQty ? { ...update, oldQty, newQty } : update,
      user: req.user,
      req
    });

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
