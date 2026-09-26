const express = require('express');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/sales
router.get('/', async (req, res) => {
  const sales = await Sale.find().sort({ createdAt: -1 });
  res.json(sales);
});

// POST /api/sales/checkout  { customer, items: [{ productId, qty }] }
router.post('/checkout', async (req, res) => {
  try {
    const { customer, items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Add at least one item to the sale.' });
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
      if (qty > product.qty) {
        return res.status(400).json({ message: `Quantity exceeds available stock for ${product.name}.` });
      }
      const lineTotal = qty * product.price;
      saleItems.push({ product: product._id, name: product.name, qty, price: product.price, total: lineTotal });
      total += lineTotal;
    }

    // Reduce stock.
    for (const item of saleItems) {
      await Product.findByIdAndUpdate(item.product, { $inc: { qty: -item.qty } });
    }

    const count = await Sale.countDocuments();
    const invoice = 'INV-' + (1000 + count + 1);
    const sale = await Sale.create({
      invoice,
      date: todayISO(),
      customer: customerName,
      items: saleItems,
      total,
      soldBy: req.user._id
    });

    // Update or create the customer record.
    const existing = await Customer.findOne({ name: new RegExp(`^${customerName}$`, 'i') });
    if (existing) {
      existing.purchases += total;
      existing.last = todayISO();
      await existing.save();
    } else {
      await Customer.create({ name: customerName, phone: '—', type: 'Patient', purchases: total, last: todayISO() });
    }

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ message: 'Checkout failed.', error: err.message });
  }
});

module.exports = router;
