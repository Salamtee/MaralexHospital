require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const supplierRoutes = require('./routes/suppliers');
const customerRoutes = require('./routes/customers');
const adjustmentRoutes = require('./routes/adjustments');
const reportRoutes = require('./routes/reports');

const app = express();

const allowedOrigins = [
  'https://maralex-hospital.vercel.app',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5173' // adjust/remove if you don't use a local dev server on this port
];

app.use(cors({
  origin(origin, callback) {
    // allow no-origin requests (curl, server-to-server, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/adjustments', adjustmentRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the frontend (HTML/CSS/JS/PWA files) from ../frontend
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Server error.' });
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`MARALEX Allied API running on port ${PORT}`);
    console.log(`\n  Open this in your browser:  http://localhost:${PORT}\n`);
  });
});