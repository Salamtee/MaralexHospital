const express = require('express');
const Purchase = require('../models/Purchase');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const BankTransaction = require('../models/BankTransaction');
const { requireAuth, requireWrite, requireRole } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();
router.use(requireAuth);
router.use(requireRole('Supervisor', 'Owner'));
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return requireWrite(req, res, next);
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nextInvoice() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `PO-${y}${m}${day}-${rand}`;
}

function statusFromItems(items) {
  if (!items.length) return 'Ordered';
  const all = items.every((i) => (i.receivedQty || 0) >= i.qty);
  const any = items.some((i) => (i.receivedQty || 0) > 0);
  if (all) return 'Received';
  if (any) return 'Partially Received';
  return 'Ordered';
}

// GET /api/purchases
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const purchases = await Purchase.find(filter).sort({ createdAt: -1 });
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ message: 'Could not load purchases.', error: err.message });
  }
});

// POST /api/purchases
// body: { supplierId?, supplier, date, notes, paidFromBank, bankName, status?, expectedDate?,
//         amountPaid?, items: [{ productId, qty, unitCost }] }
// amountPaid: how much has been paid now (defaults to the full total). Balance = total - amountPaid.
// status: 'Ordered' (PO only, no stock yet) or 'Received' (immediate goods received)
router.post('/', async (req, res) => {
  try {
    const {
      supplierId, supplier, date, notes, paidFromBank, bankName,
      items, status: requestedStatus, expectedDate, amountPaid
    } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Add at least one item to the purchase.' });
    }

    let supplierName = (supplier || '').trim();
    let sid = supplierId || null;
    if (supplierId) {
      const s = await Supplier.findById(supplierId);
      if (s) {
        supplierName = s.name;
        sid = s._id;
      }
    }
    if (!supplierName) {
      return res.status(400).json({ message: 'Supplier name is required.' });
    }

    const asOrder = requestedStatus === 'Ordered';
    const purchaseItems = [];
    let total = 0;

    for (const line of items) {
      const product = await Product.findById(line.productId);
      if (!product) {
        return res.status(404).json({ message: 'One of the products no longer exists.' });
      }
      const qty = Number(line.qty) || 0;
      const unitCost = Number(line.unitCost);
      if (qty <= 0) return res.status(400).json({ message: `Invalid quantity for ${product.name}.` });
      if (isNaN(unitCost) || unitCost < 0) {
        return res.status(400).json({ message: `Invalid unit cost for ${product.name}.` });
      }
      const lineTotal = qty * unitCost;
      purchaseItems.push({
        product: product._id,
        name: product.name,
        qty,
        unitCost,
        total: lineTotal,
        receivedQty: asOrder ? 0 : qty
      });
      total += lineTotal;
    }

    // Payment: amountPaid defaults to the full total; the rest is the balance owed
    let paid = total;
    if (amountPaid !== undefined && amountPaid !== null && amountPaid !== '') {
      paid = Number(amountPaid);
      if (isNaN(paid) || paid < 0) {
        return res.status(400).json({ message: 'Amount paid must be 0 or more.' });
      }
      if (paid > total) {
        return res.status(400).json({ message: 'Amount paid cannot be more than the total cost.' });
      }
    }

    // Only increase stock if receiving now
    if (!asOrder) {
      for (const item of purchaseItems) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { qty: item.qty },
          ...(item.unitCost > 0 ? { cost: item.unitCost } : {})
        });
      }
    }

    const purchase = await Purchase.create({
      invoice: nextInvoice(),
      date: date || todayISO(),
      supplier: supplierName,
      supplierId: sid,
      items: purchaseItems,
      total,
      amountPaid: paid,
      notes: (notes || '').trim(),
      status: asOrder ? 'Ordered' : 'Received',
      expectedDate: (expectedDate || '').trim(),
      paidFromBank: !!paidFromBank,
      bankName: (bankName || '').trim(),
      recordedBy: req.user._id,
      recordedByName: req.user.name || req.user.username
    });

    if (paidFromBank && paid > 0) {
      await BankTransaction.create({
        type: 'Withdrawal',
        amount: paid,
        date: date || todayISO(),
        bankName: (bankName || '').trim() || 'Pharmacy Bank',
        purpose: `Purchase ${purchase.invoice} — ${supplierName}`,
        reference: purchase.invoice,
        recordedBy: req.user._id,
        recordedByName: req.user.name || req.user.username
      });
    }

    await logAudit({
      action: 'CREATE',
      entity: 'Purchase',
      entityId: purchase._id,
      summary: `${asOrder ? 'Ordered' : 'Received'} ${purchase.invoice} from ${supplierName} (total ${total}, paid ${paid}, balance ${total - paid})`,
      user: req.user,
      req
    });

    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ message: 'Could not record purchase.', error: err.message });
  }
});

// POST /api/purchases/:id/payment
// body: { amount, paidFromBank?, bankName? } — record a payment towards the balance
router.post('/:id/payment', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found.' });
    if (purchase.status === 'Cancelled') {
      return res.status(400).json({ message: 'This order is cancelled.' });
    }
    const alreadyPaid = purchase.amountPaid == null ? purchase.total : purchase.amountPaid;
    const balance = purchase.total - alreadyPaid;
    if (balance <= 0) return res.status(400).json({ message: 'This purchase is already fully paid.' });

    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Enter a valid payment amount.' });
    if (amount > balance) {
      return res.status(400).json({ message: `Payment cannot be more than the balance (${balance}).` });
    }

    purchase.amountPaid = alreadyPaid + amount;
    await purchase.save();

    if (req.body.paidFromBank) {
      await BankTransaction.create({
        type: 'Withdrawal',
        amount,
        date: todayISO(),
        bankName: String(req.body.bankName || '').trim() || 'Pharmacy Bank',
        purpose: `Balance payment — ${purchase.invoice} (${purchase.supplier})`,
        reference: purchase.invoice,
        recordedBy: req.user._id,
        recordedByName: req.user.name || req.user.username
      });
    }

    await logAudit({
      action: 'UPDATE',
      entity: 'Purchase',
      entityId: purchase._id,
      summary: `Balance payment of ${amount} on ${purchase.invoice} (remaining ${purchase.total - purchase.amountPaid})`,
      user: req.user,
      req
    });
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: 'Could not record payment.', error: err.message });
  }
});

// POST /api/purchases/:id/receive
// body: { lines: [{ productId, qty }] }  — qty received now
router.post('/:id/receive', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found.' });
    if (purchase.status === 'Cancelled') {
      return res.status(400).json({ message: 'This order is cancelled.' });
    }
    if (purchase.status === 'Received') {
      return res.status(400).json({ message: 'Already fully received.' });
    }

    const lines = req.body.lines || [];
    if (!Array.isArray(lines) || lines.length === 0) {
      // Receive all remaining
      for (const item of purchase.items) {
        const remaining = item.qty - (item.receivedQty || 0);
        if (remaining > 0) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { qty: remaining },
            ...(item.unitCost > 0 ? { cost: item.unitCost } : {})
          });
          item.receivedQty = item.qty;
        }
      }
    } else {
      for (const line of lines) {
        const item = purchase.items.find((i) => String(i.product) === String(line.productId));
        if (!item) continue;
        const qty = Number(line.qty) || 0;
        if (qty <= 0) continue;
        const remaining = item.qty - (item.receivedQty || 0);
        const take = Math.min(qty, remaining);
        if (take <= 0) continue;
        await Product.findByIdAndUpdate(item.product, {
          $inc: { qty: take },
          ...(item.unitCost > 0 ? { cost: item.unitCost } : {})
        });
        item.receivedQty = (item.receivedQty || 0) + take;
      }
    }

    purchase.status = statusFromItems(purchase.items);
    await purchase.save();

    await logAudit({
      action: 'RECEIVE',
      entity: 'Purchase',
      entityId: purchase._id,
      summary: `Received goods for ${purchase.invoice} → ${purchase.status}`,
      user: req.user,
      req
    });

    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: 'Could not receive goods.', error: err.message });
  }
});

// PUT /api/purchases/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found.' });
    if (purchase.status === 'Received') {
      return res.status(400).json({ message: 'Cannot cancel a fully received order. Delete instead to reverse stock.' });
    }
    // If partially received, reverse only received qty
    for (const item of purchase.items) {
      const recv = item.receivedQty || 0;
      if (recv > 0 && item.product) {
        const p = await Product.findById(item.product);
        if (p) {
          p.qty = Math.max(0, p.qty - recv);
          await p.save();
        }
        item.receivedQty = 0;
      }
    }
    purchase.status = 'Cancelled';
    await purchase.save();
    await logAudit({
      action: 'CANCEL',
      entity: 'Purchase',
      entityId: purchase._id,
      summary: `Cancelled ${purchase.invoice}`,
      user: req.user,
      req
    });
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: 'Could not cancel.', error: err.message });
  }
});

// DELETE /api/purchases/:id  (reverses received stock)
router.delete('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) return res.status(404).json({ message: 'Purchase not found.' });

    for (const item of purchase.items) {
      const recv = item.receivedQty != null ? item.receivedQty : (purchase.status === 'Received' ? item.qty : 0);
      if (item.product && recv > 0) {
        const p = await Product.findById(item.product);
        if (p) {
          p.qty = Math.max(0, p.qty - recv);
          await p.save();
        }
      }
    }

    await purchase.deleteOne();
    await logAudit({
      action: 'DELETE',
      entity: 'Purchase',
      entityId: req.params.id,
      summary: `Deleted ${purchase.invoice}`,
      user: req.user,
      req
    });
    res.json({ message: 'Purchase deleted and stock reversed.', id: req.params.id });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete purchase.', error: err.message });
  }
});

module.exports = router;
