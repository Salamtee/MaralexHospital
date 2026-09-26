const express = require('express');
const Supplier = require('../models/Supplier');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const suppliers = await Supplier.find().sort({ createdAt: 1 });
  res.json(suppliers);
});

router.post('/', async (req, res) => {
  try {
    const { name, contact, phone } = req.body;
    if (!name || !contact || !phone) {
      return res.status(400).json({ message: 'Supplier name, contact and phone are required.' });
    }
    const supplier = await Supplier.create({ name: name.trim(), contact: contact.trim(), phone: phone.trim() });
    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ message: 'Could not add supplier.', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
  res.json(supplier);
});

router.delete('/:id', async (req, res) => {
  const supplier = await Supplier.findByIdAndDelete(req.params.id);
  if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });
  res.json({ message: 'Supplier deleted.' });
});

module.exports = router;
