const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // e.g. CREATE, UPDATE, DELETE, LOGIN, DISPENSE
    entity: { type: String, required: true }, // e.g. Product, Sale, BankTransaction
    entityId: { type: String, default: '' },
    summary: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    ip: { type: String, default: '' }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
