const express = require('express');
const Treatment = require('../models/Treatment');
const { requireAuth, requireWrite, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { notifySupervisorsAndOwners } = require('../utils/notify');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return requireWrite(req, res, next);
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextNo() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TR-${y}${m}${day}-${rand}`;
}

// GET /api/treatments — Supervisor & Owner (and Pharmacist can view if needed)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.paymentStatus = req.query.status;
    if (req.query.q) {
      const q = req.query.q;
      filter.$or = [
        { patientName: new RegExp(q, 'i') },
        { treatmentNo: new RegExp(q, 'i') },
        { patientPhone: new RegExp(q, 'i') }
      ];
    }
    const list = await Treatment.find(filter).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Could not load treatments.', error: err.message });
  }
});

// POST /api/treatments — Supervisor only (write already blocked for Owner)
router.post('/', requireRole('Supervisor'), async (req, res) => {
  try {
    const {
      patientName, patientPhone, diagnosis, treatmentDetails, doctorName,
      totalAmount, date, notes, initialPayment, paymentMethod, paymentReference
    } = req.body;

    if (!patientName || !treatmentDetails) {
      return res.status(400).json({ message: 'Patient name and treatment details are required.' });
    }
    const total = Number(totalAmount) || 0;
    if (total < 0) return res.status(400).json({ message: 'Invalid total amount.' });

    const t = new Treatment({
      treatmentNo: nextNo(),
      date: date || todayISO(),
      patientName: patientName.trim(),
      patientPhone: (patientPhone || '').trim(),
      diagnosis: (diagnosis || '').trim(),
      treatmentDetails: treatmentDetails.trim(),
      doctorName: (doctorName || '').trim(),
      totalAmount: total,
      notes: (notes || '').trim(),
      payments: [],
      recordedBy: req.user._id,
      recordedByName: req.user.name || req.user.username
    });

    const paid = Number(initialPayment) || 0;
    if (paid > 0) {
      t.payments.push({
        date: date || todayISO(),
        amount: Math.min(paid, total),
        method: paymentMethod || 'Cash',
        reference: (paymentReference || '').trim(),
        recordedBy: req.user._id,
        recordedByName: req.user.name || req.user.username
      });
    }
    t.recalcPayment();
    await t.save();

    await logAudit({
      action: 'CREATE',
      entity: 'Treatment',
      entityId: t._id,
      summary: `Treatment ${t.treatmentNo} for ${t.patientName} — ${t.paymentStatus}`,
      user: req.user,
      req
    });

    notifySupervisorsAndOwners({
      title: 'New patient treatment',
      body: `${t.patientName}: ${t.treatmentNo} · Total Le ${t.totalAmount.toLocaleString()} · ${t.paymentStatus}`,
      url: '/?page=treatments',
      tag: 'treatment-' + t._id
    }).catch(() => {});

    res.status(201).json(t);
  } catch (err) {
    res.status(500).json({ message: 'Could not record treatment.', error: err.message });
  }
});

// POST /api/treatments/:id/payment — Supervisor records additional payment
router.post('/:id/payment', requireRole('Supervisor'), async (req, res) => {
  try {
    const t = await Treatment.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Treatment not found.' });
    if (t.paymentStatus === 'Paid') {
      return res.status(400).json({ message: 'This treatment is already fully paid.' });
    }

    const amount = Number(req.body.amount) || 0;
    if (amount <= 0) return res.status(400).json({ message: 'Enter a valid payment amount.' });

    t.payments.push({
      date: req.body.date || todayISO(),
      amount: Math.min(amount, t.balance || t.totalAmount),
      method: req.body.method || 'Cash',
      reference: (req.body.reference || '').trim(),
      recordedBy: req.user._id,
      recordedByName: req.user.name || req.user.username
    });
    t.recalcPayment();
    await t.save();

    await logAudit({
      action: 'UPDATE',
      entity: 'Treatment',
      entityId: t._id,
      summary: `Payment Le ${amount} on ${t.treatmentNo} → ${t.paymentStatus} (balance Le ${t.balance})`,
      user: req.user,
      req
    });

    notifySupervisorsAndOwners({
      title: 'Treatment payment recorded',
      body: `${t.patientName}: +Le ${amount.toLocaleString()} · Balance Le ${t.balance.toLocaleString()}`,
      url: '/?page=treatments',
      tag: 'treatment-pay-' + t._id
    }).catch(() => {});

    res.json(t);
  } catch (err) {
    res.status(500).json({ message: 'Could not record payment.', error: err.message });
  }
});

router.delete('/:id', requireRole('Supervisor'), async (req, res) => {
  try {
    const t = await Treatment.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: 'Treatment not found.' });
    res.json({ message: 'Treatment deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete.', error: err.message });
  }
});

module.exports = router;
