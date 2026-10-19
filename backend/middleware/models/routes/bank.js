const express = require('express');
const BankTransaction = require('../models/BankTransaction');
const { requireAuth, requireWrite, requireRole } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { logAudit } = require('../utils/audit');
const { notifySupervisorsAndOwners } = require('../utils/notify');

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

function academicYearRange(refDate = new Date()) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const startYear = m < 8 ? y - 1 : y;
  return {
    start: `${startYear}-09-01`,
    end: `${startYear + 1}-08-31`,
    label: `${startYear}/${String(startYear + 1).slice(2)}`
  };
}

// GET /api/bank/summary
router.get('/summary', async (req, res) => {
  try {
    const range = academicYearRange();
    const all = await BankTransaction.find().sort({ date: 1, createdAt: 1 });

    const openingDoc = all.find((t) => t.type === 'Opening');
    const openingBalance = openingDoc ? openingDoc.amount : 0;
    const openingDate = openingDoc ? openingDoc.date : null;

    const inYear = (d) => d >= range.start && d <= range.end;

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    for (const t of all) {
      if (t.type === 'Deposit' && inYear(t.date)) totalDeposits += t.amount;
      if (t.type === 'Withdrawal' && inYear(t.date)) totalWithdrawals += t.amount;
    }

    let bankBalance = openingBalance;
    for (const t of all) {
      if (t.type === 'Deposit') bankBalance += t.amount;
      if (t.type === 'Withdrawal') bankBalance -= t.amount;
    }

    res.json({
      openingBalance,
      openingDate,
      totalDeposits,
      totalWithdrawals,
      bankBalance,
      academicYear: range.label,
      academicYearStart: range.start,
      academicYearEnd: range.end
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not load bank summary.', error: err.message });
  }
});

// GET /api/bank
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.type && ['Deposit', 'Withdrawal', 'Opening'].includes(req.query.type)) {
      filter.type = req.query.type;
    }
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = req.query.from;
      if (req.query.to) filter.date.$lte = req.query.to;
    }
    const txs = await BankTransaction.find(filter).sort({ date: -1, createdAt: -1 });
    res.json(txs);
  } catch (err) {
    res.status(500).json({ message: 'Could not load bank transactions.', error: err.message });
  }
});

// POST /api/bank  — JSON or multipart (with optional slip file)
router.post('/', upload.single('slip'), async (req, res) => {
  try {
    const { type, amount, date, bankName, purpose, reference } = req.body;
    if (!['Deposit', 'Withdrawal', 'Opening'].includes(type)) {
      return res.status(400).json({ message: 'Type must be Deposit, Withdrawal or Opening.' });
    }
    const amt = Number(amount);
    if (!amt || amt < 0) {
      return res.status(400).json({ message: 'Enter a valid amount.' });
    }
    if (type !== 'Opening' && !bankName) {
      return res.status(400).json({ message: 'Bank name is required.' });
    }

    if (type === 'Opening') {
      await BankTransaction.deleteMany({ type: 'Opening' });
    }

    const slipFile = req.file ? req.file.filename : '';

    const tx = await BankTransaction.create({
      type,
      amount: amt,
      date: date || todayISO(),
      bankName: (bankName || '').trim(),
      purpose: (purpose || '').trim() || (type === 'Opening' ? 'Opening balance' : ''),
      reference: (reference || '').trim(),
      slipFile,
      recordedBy: req.user._id,
      recordedByName: req.user.name || req.user.username
    });

    await logAudit({
      action: 'CREATE',
      entity: 'BankTransaction',
      entityId: tx._id,
      summary: `${type} Le ${amt} — ${tx.purpose || tx.bankName}`,
      user: req.user,
      req
    });

    if (type !== 'Opening') {
      notifySupervisorsAndOwners({
        title: `Bank ${type}`,
        body: `Le ${Number(amt).toLocaleString()} · ${tx.bankName || ''} · ${tx.purpose || ''}`,
        url: '/?page=bank',
        tag: 'bank-' + tx._id
      }).catch(() => {});
    }

    res.status(201).json(tx);
  } catch (err) {
    res.status(500).json({ message: 'Could not record transaction.', error: err.message });
  }
});

// DELETE /api/bank/:id
router.delete('/:id', async (req, res) => {
  try {
    const tx = await BankTransaction.findByIdAndDelete(req.params.id);
    if (!tx) return res.status(404).json({ message: 'Transaction not found.' });
    await logAudit({
      action: 'DELETE',
      entity: 'BankTransaction',
      entityId: req.params.id,
      summary: `Deleted ${tx.type} Le ${tx.amount}`,
      user: req.user,
      req
    });
    res.json({ message: 'Transaction deleted.', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete transaction.', error: err.message });
  }
});

module.exports = router;
