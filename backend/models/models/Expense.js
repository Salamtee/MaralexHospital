const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    category: {
      type: String,
      enum: [
        'Utilities',
        'Salaries & Wages',
        'Rent',
        'Transport',
        'Maintenance',
        'Office Supplies',
        'Professional Fees',
        'Bank Charges',
        'Other'
      ],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true },
    paidFromBank: { type: Boolean, default: false },
    bankName: { type: String, default: '' },
    reason: { type: String, default: '', trim: true }, // why the money was spent
    reference: { type: String, default: '' }, // legacy field (no longer used)
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
