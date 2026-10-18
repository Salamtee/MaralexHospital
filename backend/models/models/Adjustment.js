const mongoose = require('mongoose');

const adjustmentSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    item: { type: String, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    type: { type: String, enum: ['Received', 'Damaged', 'Correction'], required: true },
    qty: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    adjustedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Adjustment', adjustmentSchema);
