const express = require('express');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Purchase = require('../models/Purchase');
const Expense = require('../models/Expense');
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
  const nowMs = Date.now();
  const nearExpiry = products.filter((p) => {
    const d = new Date(p.expiry).getTime() - nowMs;
    return d > 0 && d < 90 * 864e5;
  }).length;

  // Fixed calendar week: Sunday → Saturday (never a rolling Tue–Mon window)
  const last7 = [];
  const weekLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const localToday = new Date();
  const localMidnight = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate());
  const sunday = new Date(localMidnight);
  sunday.setDate(localMidnight.getDate() - localMidnight.getDay()); // getDay(): 0 = Sunday
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i);
    const iso =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    const value = sales.filter((s) => s.date === iso).reduce((a, s) => a + s.total, 0);
    last7.push({ date: iso, label: weekLabels[i], value });
  }

  const alerts = products
    .filter((p) => statusOf(p) !== 'ok')
    .slice(0, 8)
    .map((p) => ({ id: p._id, name: p.name, status: statusOf(p), qty: p.qty, reorder: p.reorder }));

  const recentSales = sales
    .slice(-8)
    .reverse()
    .map((s) => ({
      invoice: s.invoice,
      date: s.date,
      customer: s.customer,
      units: s.items.reduce((a, i) => a + i.qty, 0),
      total: s.total
    }));

  // Category pie data
  const byCat = {};
  for (const p of products) {
    byCat[p.cat] = (byCat[p.cat] || 0) + 1;
  }
  const categories = Object.entries(byCat).map(([name, value]) => ({ name, value }));

  // Stock health for progress / donut
  const stockStatus = { ok: 0, low: 0, out: 0, expired: 0 };
  for (const p of products) {
    stockStatus[statusOf(p)] = (stockStatus[statusOf(p)] || 0) + 1;
  }

  const weekSalesTotal = last7.reduce((a, x) => a + x.value, 0);
  const monthStart = today.slice(0, 7) + '-01';
  const monthSales = sales.filter((s) => s.date >= monthStart).reduce((a, s) => a + s.total, 0);
  const totalRevenue = sales.reduce((a, s) => a + s.total, 0);

  // Top products by units sold
  const productUnits = {};
  for (const s of sales) {
    for (const i of s.items || []) {
      productUnits[i.name] = (productUnits[i.name] || 0) + i.qty;
    }
  }
  const topProducts = Object.entries(productUnits)
    .map(([name, units]) => ({ name, units }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  res.json({
    items,
    low,
    todaySales,
    nearExpiry,
    last7,
    alerts,
    recentSales,
    categories,
    stockStatus,
    weekSalesTotal,
    monthSales,
    totalRevenue,
    topProducts
  });
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
      items: s.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, total: i.total })),
      itemsText: s.items.map((i) => `${i.name} x${i.qty}`).join(', '),
      units: s.items.reduce((a, i) => a + i.qty, 0),
      total: s.total
    }))
  });
});


// GET /api/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/pnl', async (req, res) => {
  try {
    const from = req.query.from || todayISO().slice(0, 7) + '-01';
    const to = req.query.to || todayISO();

    const sales = await Sale.find({ date: { $gte: from, $lte: to } });
    const purchases = await Purchase.find({
      date: { $gte: from, $lte: to },
      status: { $in: ['Received', 'Partially Received'] }
    });
    const expenses = await Expense.find({ date: { $gte: from, $lte: to } });

    const revenue = sales.reduce((a, s) => a + s.total, 0);
    // Approximate COGS from purchase totals in period (received portion)
    let cogs = 0;
    for (const p of purchases) {
      for (const item of p.items || []) {
        const recv = item.receivedQty != null ? item.receivedQty : (p.status === 'Received' ? item.qty : 0);
        cogs += recv * (item.unitCost || 0);
      }
    }
    const grossProfit = revenue - cogs;
    const expenseTotal = expenses.reduce((a, e) => a + e.amount, 0);
    const netProfit = grossProfit - expenseTotal;

    const expensesByCategory = {};
    for (const e of expenses) {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
    }

    res.json({
      from,
      to,
      revenue,
      salesCount: sales.length,
      cogs,
      purchaseCount: purchases.length,
      grossProfit,
      expenses: expenseTotal,
      expensesByCategory,
      expenseCount: expenses.length,
      netProfit
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not build P&L report.', error: err.message });
  }
});

module.exports = router;