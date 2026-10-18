const express = require('express');
const PushSubscription = require('../models/PushSubscription');
const { requireAuth } = require('../middleware/auth');
const { getPublicKey } = require('../utils/notify');

const router = express.Router();

// Public key for client subscribe (auth required so only logged-in users subscribe)
router.get('/vapid-public-key', requireAuth, (req, res) => {
  try {
    res.json({ publicKey: getPublicKey() });
  } catch (err) {
    res.status(500).json({ message: 'Push not configured.', error: err.message });
  }
});

// Save subscription — Supervisor & Owner primarily
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ message: 'Invalid push subscription.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        user: req.user._id,
        role: req.user.role,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: req.headers['user-agent'] || ''
      },
      { upsert: true, new: true }
    );

    res.json({ message: 'Subscribed to push notifications.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not save subscription.', error: err.message });
  }
});

router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await PushSubscription.deleteOne({ endpoint });
    else await PushSubscription.deleteMany({ user: req.user._id });
    res.json({ message: 'Unsubscribed.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not unsubscribe.', error: err.message });
  }
});

module.exports = router;
