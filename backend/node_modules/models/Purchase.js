const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    receivedQty: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    invoice: { type: String, required: true, unique: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    supplier: { type: String, required: true, trim: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    items: { type: [purchaseItemSchema], required: true },
    total: { type: Number, required: true, min: 0 }, // total cost of the purchase
    // Amount paid so far. Older records have no value: they are treated as fully paid.
    amountPaid: { type: Number, min: 0 },
    notes: { type: String, default: '' },
    // Workflow: Ordered → Partially Received → Received (or direct Received)
    status: {
      type: String,
      enum: ['Ordered', 'Partially Received', 'Received', 'Cancelled'],
      default: 'Received'
    },
    expectedDate: { type: String, default: '' },
    paidFromBank: { type: Boolean, default: false },
    bankName: { type: String, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, default: '' }
  },
  {
    timestamps: true,
    toJSON: {
      // Always expose amountPaid + balance so the frontend can show them
      transform(doc, ret) {
        const paid = ret.amountPaid == null ? ret.total : ret.amountPaid;
        ret.amountPaid = paid;
        ret.balance = Math.max(0, Math.round((ret.total - paid) * 100) / 100);
        return ret;
      }
    }
  }
);

module.exports = mongoose.model('Purchase', purchaseSchema);
