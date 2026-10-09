const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    total: { type: Number, required: true }
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    invoice: { type: String, required: true, unique: true },
    date: { type: String, required: true }, // YYYY-MM-DD, kept as string for simple period filtering
    customer: { type: String, required: true, trim: true },
    items: { type: [saleItemSchema], required: true },
    total: { type: Number, required: true },
    soldBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sale', saleSchema);
