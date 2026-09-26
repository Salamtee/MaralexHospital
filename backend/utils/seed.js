// Seeds ONLY the two staff login accounts. It never creates any inventory,
// sales, supplier, customer or adjustment records — the system starts
// completely empty of operational data.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const accounts = [
  { name: 'Chief Pharmacist', username: 'pharmacist', password: 'Pharm@123', role: 'Pharmacist', phone: '' },
  { name: 'System Supervisor', username: 'supervisor', password: 'Super@123', role: 'Supervisor', phone: '' }
];

(async () => {
  await connectDB();

  for (const acc of accounts) {
    const exists = await User.findOne({ username: acc.username });
    if (exists) {
      console.log(`Skipped "${acc.username}" — account already exists.`);
      continue;
    }
    await User.create(acc);
    console.log(`Created ${acc.role} account "${acc.username}".`);
  }

  console.log('Seeding complete. Change these default passwords after first login.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
