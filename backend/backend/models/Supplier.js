const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    products: { type: String, default: 'General Medical Supplies' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Supplier', supplierSchema);
