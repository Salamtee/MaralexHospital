const express = require('express');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { requireAuth, requireWrite } = require('../middleware/auth');
const { notifySupervisorsAndOwners } = require('../utils/notify');
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

// GET /api/sales
router.get('/', async (req, res) => {
  const sales = await Sale.find().sort({ createdAt: -1 });
  res.json(sales);
});

// POST /api/sales/checkout  { customer, items: [{ productId, qty }], date?, deductStock? }
// date + deductStock are for recording PAST sales and are Supervisor only:
//   date         YYYY-MM-DD, today or earlier (defaults to today)
//   deductStock  false = do not change current stock (stock already reflects the sale)
router.post('/checkout', async (req, res) => {
  try {
    const { customer, items, date: requestedDate, deductStock } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Add at least one item to the sale.' });
    }

    // Past sales: Supervisor only
    let saleDate = todayISO();
    let reduceStock = true;
    const wantsPast = (requestedDate && requestedDate !== saleDate) || deductStock === false;
    if (wantsPast) {
      if (req.user.role !== 'Supervisor') {
        return res.status(403).json({ message: 'Only a Supervisor can record past sales.' });
      }
      if (requestedDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || isNaN(new Date(requestedDate + 'T12:00:00'))) {
          return res.status(400).json({ message: 'Enter a valid sale date.' });
        }
        if (requestedDate > todayISO()) {
          return res.status(400).json({ message: 'Sale date cannot be in the future.' });
        }
        saleDate = requestedDate;
      }
      if (deductStock === false) reduceStock = false;
    }

    const customerName = (customer || '').trim() || 'Walk-in Patient';
    const saleItems = [];
    let total = 0;

    // Validate stock and build line items first.
    for (const line of items) {
      const product = await Product.findById(line.productId);
      if (!product) return res.status(404).json({ message: 'One of the items no longer exists.' });
      const qty = Number(line.qty) || 0;
      if (qty <= 0) return res.status(400).json({ message: `Invalid quantity for ${product.name}.` });
      if (reduceStock && qty > product.qty) {
        return res.status(400).json({ message: `Quantity exceeds available stock for ${product.name}.` });
      }
      const lineTotal = qty * product.price;
      saleItems.push({ product: product._id, name: product.name, qty, price: product.price, total: lineTotal });
      total += lineTotal;
    }

    // Reduce stock (skipped for a past sale already reflected in current stock).
    if (reduceStock) {
      for (const item of saleItems) {
        await Product.findByIdAndUpdate(item.product, { $inc: { qty: -item.qty } });
      }
    }

    const count = await Sale.countDocuments();
    const invoice = 'INV-' + (1000 + count + 1);
    const sale = await Sale.create({
      invoice,
      date: saleDate,
      customer: customerName,
      items: saleItems,
      total,
      soldBy: req.user._id
    });

    // Update or create the customer record.
    const existing = await Customer.findOne({ name: new RegExp(`^${customerName}$`, 'i') });
    if (existing) {
      existing.purchases += total;
      if (!existing.last || existing.last === '—' || saleDate > existing.last) existing.last = saleDate;
      await existing.save();
    } else {
      await Customer.create({ name: customerName, phone: '—', type: 'Patient', purchases: total, last: saleDate });
    }

    if (wantsPast) {
      await logAudit({
        action: 'CREATE',
        entity: 'Sale',
        entityId: sale._id,
        summary: `Recorded past sale ${sale.invoice} dated ${saleDate} for ${customerName} (Le ${total})${reduceStock ? '' : ' - stock not changed'}`,
        user: req.user,
        req
      });
    }

    if (!wantsPast) notifySupervisorsAndOwners({
      title: 'New sale completed',
      body: `Invoice ${sale.invoice} · ${sale.customer} · Le ${Number(sale.total || 0).toLocaleString()}`,
      url: '/?page=reports',
      tag: 'sale-' + sale._id
    }).catch(() => {});

    // Low stock check after sale
    if (reduceStock) for (const item of saleItems) {
      const p = await Product.findById(item.product);
      if (p && p.qty <= p.reorder) {
        notifySupervisorsAndOwners({
          title: 'Low stock after sale',
          body: `${p.name} (${p.sku}) — only ${p.qty} left`,
          url: '/?page=inventory',
          tag: 'low-' + p._id
        }).catch(() => {});
      }
    }

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ message: 'Checkout failed.', error: err.message });
  }
});

module.exports = router;
