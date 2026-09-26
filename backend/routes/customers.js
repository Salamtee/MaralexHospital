const express = require('express');
const Customer = require('../models/Customer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const customers = await Customer.find().sort({ createdAt: 1 });
  res.json(customers);
});

router.post('/', async (req, res) => {
  try {
    const { name, phone, type } = req.body;
    if (!name || !phone) return res.status(400).json({ message: 'Name and phone are required.' });
    const customer = await Customer.create({ name: name.trim(), phone: phone.trim(), type: type || 'Patient' });
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ message: 'Could not add customer.', error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!customer) return res.status(404).json({ message: 'Customer not found.' });
  res.json(customer);
});

router.delete('/:id', async (req, res) => {
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) return res.status(404).json({ message: 'Customer not found.' });
  res.json({ message: 'Customer deleted.' });
});

module.exports = router;
