const express = require('express');
const Prescription = require('../models/Prescription');
const Product = require('../models/Product');
const { requireAuth, requireWrite } = require('../middleware/auth');
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

function nextRx() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RX-${y}${m}${day}-${rand}`;
}

function recalcStatus(items) {
  if (!items.length) return 'Pending';
  const allDone = items.every((i) => i.dispensed >= i.qty);
  const anyDone = items.some((i) => i.dispensed > 0);
  if (allDone) return 'Dispensed';
  if (anyDone) return 'Partially Dispensed';
  return 'Pending';
}

// GET /api/prescriptions
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const q = req.query.q;
      filter.$or = [
        { patientName: new RegExp(q, 'i') },
        { rxNumber: new RegExp(q, 'i') },
        { doctorName: new RegExp(q, 'i') }
      ];
    }
    const list = await Prescription.find(filter).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Could not load prescriptions.', error: err.message });
  }
});

// POST /api/prescriptions
// body: { patientName, patientPhone, doctorName, diagnosis, notes, date, items: [{ productId, qty, dosage, duration }] }
router.post('/', async (req, res) => {
  try {
    const { patientName, patientPhone, doctorName, diagnosis, notes, date, items } = req.body;
    if (!patientName || !patientName.trim()) {
      return res.status(400).json({ message: 'Patient name is required.' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Add at least one medicine.' });
    }

    const rxItems = [];
    for (const line of items) {
      const product = await Product.findById(line.productId);
      if (!product) return res.status(404).json({ message: 'One of the products no longer exists.' });
      const qty = Number(line.qty) || 0;
      if (qty <= 0) return res.status(400).json({ message: `Invalid quantity for ${product.name}.` });
      rxItems.push({
        product: product._id,
        name: product.name,
        qty,
        dosage: (line.dosage || '').trim(),
        duration: (line.duration || '').trim(),
        dispensed: 0
      });
    }

    const rx = await Prescription.create({
      rxNumber: nextRx(),
      date: date || todayISO(),
      patientName: patientName.trim(),
      patientPhone: (patientPhone || '').trim(),
      doctorName: (doctorName || '').trim(),
      diagnosis: (diagnosis || '').trim(),
      notes: (notes || '').trim(),
      items: rxItems,
      status: 'Pending',
      recordedBy: req.user._id,
      recordedByName: req.user.name || req.user.username
    });

    await logAudit({
      action: 'CREATE',
      entity: 'Prescription',
      entityId: rx._id,
      summary: `Created prescription ${rx.rxNumber} for ${rx.patientName}`,
      user: req.user,
      req
    });

    res.status(201).json(rx);
  } catch (err) {
    res.status(500).json({ message: 'Could not create prescription.', error: err.message });
  }
});

// POST /api/prescriptions/:id/dispense
// body: { lines: [{ productId or index, qty }] }  — qty to dispense now
router.post('/:id/dispense', async (req, res) => {
  try {
    const rx = await Prescription.findById(req.params.id);
    if (!rx) return res.status(404).json({ message: 'Prescription not found.' });
    if (rx.status === 'Cancelled') {
      return res.status(400).json({ message: 'This prescription is cancelled.' });
    }
    if (rx.status === 'Dispensed') {
      return res.status(400).json({ message: 'Already fully dispensed.' });
    }

    const lines = req.body.lines || [];
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: 'Specify what to dispense.' });
    }

    for (const line of lines) {
      const item = rx.items.find(
        (i) =>
          String(i.product) === String(line.productId) ||
          i.name === line.name
      );
      if (!item) continue;
      const qty = Number(line.qty) || 0;
      if (qty <= 0) continue;
      const remaining = item.qty - item.dispensed;
      if (qty > remaining) {
        return res.status(400).json({
          message: `Cannot dispense ${qty} of ${item.name}; only ${remaining} remaining.`
        });
      }

      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `${item.name} is no longer in inventory.` });
      }
      if (product.qty < qty) {
        return res.status(400).json({
          message: `Insufficient stock for ${item.name}. Available: ${product.qty}.`
        });
      }

      product.qty -= qty;
      await product.save();
      item.dispensed += qty;
    }

    rx.status = recalcStatus(rx.items);
    rx.dispensedBy = req.user._id;
    rx.dispensedByName = req.user.name || req.user.username;
    rx.dispensedAt = new Date();
    await rx.save();

    await logAudit({
      action: 'DISPENSE',
      entity: 'Prescription',
      entityId: rx._id,
      summary: `Dispensed from ${rx.rxNumber} (${rx.status})`,
      user: req.user,
      req
    });

    res.json(rx);
  } catch (err) {
    res.status(500).json({ message: 'Could not dispense.', error: err.message });
  }
});

// PUT /api/prescriptions/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const rx = await Prescription.findById(req.params.id);
    if (!rx) return res.status(404).json({ message: 'Prescription not found.' });
    if (rx.status === 'Dispensed') {
      return res.status(400).json({ message: 'Cannot cancel a fully dispensed prescription.' });
    }
    rx.status = 'Cancelled';
    await rx.save();
    await logAudit({
      action: 'CANCEL',
      entity: 'Prescription',
      entityId: rx._id,
      summary: `Cancelled prescription ${rx.rxNumber}`,
      user: req.user,
      req
    });
    res.json(rx);
  } catch (err) {
    res.status(500).json({ message: 'Could not cancel.', error: err.message });
  }
});

// DELETE /api/prescriptions/:id
router.delete('/:id', async (req, res) => {
  try {
    const rx = await Prescription.findByIdAndDelete(req.params.id);
    if (!rx) return res.status(404).json({ message: 'Prescription not found.' });
    await logAudit({
      action: 'DELETE',
      entity: 'Prescription',
      entityId: req.params.id,
      summary: `Deleted prescription ${rx.rxNumber}`,
      user: req.user,
      req
    });
    res.json({ message: 'Prescription deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete.', error: err.message });
  }
});

module.exports = router;
