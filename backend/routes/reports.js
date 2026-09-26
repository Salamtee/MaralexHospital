const express = require('express');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statusOf(p) {
  if (p.qty <= 0) return 'out';
  if (new Date(p.expiry) < new Date()) return 'expired';
  if (p.qty <= p.reorder) return 'low';
  return 'ok';
}

// GET /api/reports/dashboard
router.get('/dashboard', async (req, res) => {
  const products = await Product.find();
  const sales = await Sale.find();
  const today = todayISO();

  const items = products.length;
  const low = products.filter((p) => ['low', 'out'].includes(statusOf(p))).length;
  const todaySales = sales.filter((s) => s.date === today).reduce((a, s) => a + s.total, 0);
  const now = Date.now();
  const nearExpiry = products.filter((p) => {
    const d = new Date(p.expiry).getTime() - now;
    return d > 0 && d < 90 * 864e5;
  }).length;

  const last7 = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const value = sales.filter((s) => s.date === iso).reduce((a, s) => a + s.total, 0);
    last7.push({ date: iso, label: d.toLocaleDateString('en', { weekday: 'short' }), value });
  }

  const alerts = products
    .filter((p) => statusOf(p) !== 'ok')
    .slice(0, 6)
    .map((p) => ({ id: p._id, name: p.name, status: statusOf(p), qty: p.qty }));

  const recentSales = sales
    .slice(-6)
    .reverse()
    .map((s) => ({
      invoice: s.invoice,
      date: s.date,
      customer: s.customer,
      units: s.items.reduce((a, i) => a + i.qty, 0),
      total: s.total
    }));

  res.json({ items, low, todaySales, nearExpiry, last7, alerts, recentSales });
});

// GET /api/reports/sales?period=daily|weekly|monthly|yearly&date=YYYY-MM-DD
router.get('/sales', async (req, res) => {
  const { period = 'weekly', date = todayISO() } = req.query;
  const base = new Date(`${date}T12:00:00`);
  const sales = await Sale.find().sort({ createdAt: 1 });

  const filtered = sales.filter((s) => {
    const d = new Date(`${s.date}T12:00:00`);
    if (period === 'daily') return s.date === date;
    if (period === 'weekly') {
      const diff = (base - d) / 864e5;
      return diff >= 0 && diff < 7;
    }
    if (period === 'monthly') return d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth();
    return d.getFullYear() === base.getFullYear();
  });

  const total = filtered.reduce((a, s) => a + s.total, 0);
  const units = filtered.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty, 0), 0);

  res.json({
    period,
    date,
    total,
    transactions: filtered.length,
    units,
    average: filtered.length ? total / filtered.length : 0,
    sales: filtered.map((s) => ({
      invoice: s.invoice,
      date: s.date,
      customer: s.customer,
      units: s.items.reduce((a, i) => a + i.qty, 0),
      total: s.total
    }))
  });
});

module.exports = router;
