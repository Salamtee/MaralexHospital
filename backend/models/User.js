const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/** Normalize phone for storage and lookup: digits only, keep leading + if present */
function normalizePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  const hasPlus = s.startsWith('+');
  s = s.replace(/[^\d]/g, '');
  return hasPlus ? '+' + s : s;
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Kept for display / legacy; login uses phone
    username: { type: String, trim: true, lowercase: true, default: '' },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['Pharmacist', 'Supervisor', 'Owner'],
      required: true
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizePhone
    },
    avatar: { type: String, default: '' } // filename under /uploads
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.pre('validate', function ensureUsername(next) {
  if (!this.username && this.phone) {
    this.username = String(this.phone).replace(/[^\d]/g, '') || 'user';
  }
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    role: this.role,
    phone: this.phone,
    avatar: this.avatar || ''
  };
};

userSchema.statics.normalizePhone = normalizePhone;

module.exports = mongoose.model('User', userSchema);
