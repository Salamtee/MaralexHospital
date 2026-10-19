const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Deposit', 'Withdrawal', 'Opening'],
      required: true
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: String, required: true }, // YYYY-MM-DD
    bankName: { type: String, trim: true, default: '' },
    purpose: { type: String, trim: true, default: '' },
    reference: { type: String, trim: true, default: '' },
    slipFile: { type: String, default: '' }, // relative path under /uploads
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
