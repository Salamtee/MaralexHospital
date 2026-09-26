const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    cat: {
      type: String,
      enum: ['Medicines', 'Medical Supplies', 'Laboratory', 'Equipment'],
      required: true
    },
    batch: { type: String, required: true, trim: true },
    expiry: { type: Date, required: true },
    qty: { type: Number, required: true, min: 0, default: 0 },
    reorder: { type: Number, required: true, min: 0, default: 10 },
    cost: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
