const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '—' },
    type: {
      type: String,
      enum: ['Patient', 'Walk-in Customer', 'Clinic / Department'],
      default: 'Patient'
    },
    purchases: { type: Number, default: 0 },
    last: { type: String, default: '—' } // YYYY-MM-DD
  },
  { timestamps: true }
);

module.exports = mongoose.model('Customer', customerSchema);
