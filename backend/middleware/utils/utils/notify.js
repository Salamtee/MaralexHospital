const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

let vapidReady = false;

function initVapid() {
  if (vapidReady) return;
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@maralex-allied.local';

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    process.env.VAPID_PUBLIC_KEY = publicKey;
    process.env.VAPID_PRIVATE_KEY = privateKey;
    console.log('[notify] Generated ephemeral VAPID keys (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env for production).');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
}

function getPublicKey() {
  initVapid();
  return process.env.VAPID_PUBLIC_KEY;
}

/**
 * Send push to Supervisor and Owner (and optionally other roles).
 * payload: { title, body, url?, tag? }
 */
async function notifyRoles(roles, payload) {
  try {
    initVapid();
    const subs = await PushSubscription.find({ role: { $in: roles } });
    if (!subs.length) return { sent: 0 };

    const data = JSON.stringify({
      title: payload.title || 'MARALEX Allied',
      body: payload.body || '',
      url: payload.url || '/',
      tag: payload.tag || 'maralex-general'
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }
          },
          data
        );
        sent += 1;
      } catch (err) {
        // Remove expired subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.error('[notify] push failed:', err.message);
        }
      }
    }
    return { sent };
  } catch (err) {
    console.error('[notify]', err.message);
    return { sent: 0, error: err.message };
  }
}

async function notifySupervisorsAndOwners(payload) {
  return notifyRoles(['Supervisor', 'Owner'], payload);
}

module.exports = { initVapid, getPublicKey, notifyRoles, notifySupervisorsAndOwners };
