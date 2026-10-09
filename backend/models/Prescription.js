const mongoose = require('mongoose');

const prescriptionItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    dosage: { type: String, default: '' },
    duration: { type: String, default: '' },
    dispensed: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const prescriptionSchema = new mongoose.Schema(
  {
    rxNumber: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    patientName: { type: String, required: true, trim: true },
    patientPhone: { type: String, default: '' },
    doctorName: { type: String, default: '' },
    diagnosis: { type: String, default: '' },
    items: { type: [prescriptionItemSchema], required: true },
    status: {
      type: String,
      enum: ['Pending', 'Partially Dispensed', 'Dispensed', 'Cancelled'],
      default: 'Pending'
    },
    notes: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, default: '' },
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispensedByName: { type: String, default: '' },
    dispensedAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);
