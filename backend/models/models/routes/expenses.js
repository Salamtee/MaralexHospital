const express = require('express');
const Expense = require('../models/Expense');
const BankTransaction = require('../models/BankTransaction');
const { requireAuth, requireWrite, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('Supervisor', 'Owner'));
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return requireWrite(req, res, next);
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = req.query.from;
      if (req.query.to) filter.date.$lte = req.query.to;
    }
    const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: 'Could not load expenses.', error: err.message });
  }
});

// GET /api/expenses/summary
router.get('/summary', async (req, res) => {
  try {
    const expenses = await Expense.find();
    const byCategory = {};
    let total = 0;
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      total += e.amount;
    }
    res.json({ total, byCategory, count: expenses.length });
  } catch (err) {
    res.status(500).json({ message: 'Could not load expense summary.', error: err.message });
  }
});

// POST /api/expenses
// body: { date, category, amount, description, paidFromBank, bankName, reference }
router.post('/', async (req, res) => {
  try {
    const { date, category, amount, description, paidFromBank, bankName, reference } = req.body;
    const amt = Number(amount);
    if (!amt || amt < 0) return res.status(400).json({ message: 'Enter a valid amount.' });
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required.' });
    }
    if (!category) return res.status(400).json({ message: 'Category is required.' });

    const expense = await Expense.create({
      date: date || todayISO(),
      category,
      amount: amt,
      description: description.trim(),
      paidFromBank: !!paidFromBank,
      bankName: (bankName || '').trim(),
      reference: (reference || '').trim(),
      recordedBy: req.user._id,
      recordedByName: req.user.name || req.user.username
    });

    // Optionally create matching bank withdrawal
    if (paidFromBank && amt > 0) {
      await BankTransaction.create({
        type: 'Withdrawal',
        amount: amt,
        date: date || todayISO(),
        bankName: (bankName || '').trim() || 'Pharmacy Bank',
        purpose: `Expense — ${category}: ${description.trim()}`,
        reference: (reference || '').trim() || expense._id.toString(),
        recordedBy: req.user._id,
        recordedByName: req.user.name || req.user.username
      });
    }

    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ message: 'Could not record expense.', error: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    res.json({ message: 'Expense deleted.', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete expense.', error: err.message });
  }
});

module.exports = router;
