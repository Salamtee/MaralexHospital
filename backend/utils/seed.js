// Seeds the three login accounts only. Never creates inventory, sales,
// suppliers, customers or other operational data.
// Login is by phone number + password (+ role tab).
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const accounts = [
  {
    name: 'Chief Pharmacist',
    username: 'pharmacist',
    password: 'Pharm@123',
    role: 'Pharmacist',
    phone: '0760000001'
  },
  {
    name: 'System Supervisor',
    username: 'supervisor',
    password: 'Super@123',
    role: 'Supervisor',
    phone: '0760000002'
  },
  {
    name: 'System Owner',
    username: 'owner',
    password: 'Owner@123',
    role: 'Owner',
    phone: '0760000003'
  }
];

(async () => {
  await connectDB();

  for (const acc of accounts) {
    const phone = User.normalizePhone(acc.phone);
    let user = await User.findOne({
      $or: [{ phone }, { username: acc.username }]
    });

    if (user) {
      let changed = false;
      if (user.role !== acc.role) {
        user.role = acc.role;
        changed = true;
      }
      if (User.normalizePhone(user.phone || '') !== phone) {
        user.phone = phone;
        changed = true;
      }
      if (changed) {
        await user.save();
        console.log(`Updated "${acc.username}" → phone ${phone}, role ${acc.role}.`);
      } else {
        console.log(`Skipped "${acc.username}" (${phone}) — account already exists.`);
      }
      continue;
    }

    await User.create({ ...acc, phone });
    console.log(`Created ${acc.role} account phone "${phone}".`);
  }

  console.log('');
  console.log('Seeding complete. Login with phone + password:');
  console.log('  Pharmacist  phone: 0760000001   password: Pharm@123');
  console.log('  Supervisor  phone: 0760000002   password: Super@123');
  console.log('  Owner       phone: 0760000003   password: Owner@123  (view-only)');
  console.log('Change these passwords after first login.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
