const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ['Cash', 'Bank Transfer', 'Mobile Money', 'Card', 'Other'],
      default: 'Cash'
    },
    reference: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, default: '' }
  },
  { _id: true, timestamps: true }
);

const treatmentSchema = new mongoose.Schema(
  {
    treatmentNo: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    patientName: { type: String, required: true, trim: true },
    patientPhone: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    treatmentDetails: { type: String, required: true, trim: true },
    doctorName: { type: String, default: '' },
    totalAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['Unpaid', 'Partial', 'Paid'],
      default: 'Unpaid'
    },
    payments: { type: [paymentSchema], default: [] },
    notes: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

treatmentSchema.methods.recalcPayment = function recalcPayment() {
  this.amountPaid = (this.payments || []).reduce((a, p) => a + (p.amount || 0), 0);
  this.balance = Math.max(0, this.totalAmount - this.amountPaid);
  if (this.amountPaid <= 0) this.paymentStatus = 'Unpaid';
  else if (this.balance <= 0) this.paymentStatus = 'Paid';
  else this.paymentStatus = 'Partial';
};

module.exports = mongoose.model('Treatment', treatmentSchema);
