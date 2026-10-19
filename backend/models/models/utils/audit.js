const AuditLog = require('../models/AuditLog');

async function logAudit({ action, entity, entityId, summary, details, user, req }) {
  try {
    await AuditLog.create({
      action,
      entity,
      entityId: entityId ? String(entityId) : '',
      summary,
      details: details || {},
      userId: user?._id || user?.id,
      userName: user?.name || user?.username || '',
      userRole: user?.role || '',
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || ''
    });
  } catch (err) {
    // Never break the main request because of audit failure
    console.error('[audit]', err.message);
  }
}

module.exports = { logAudit };
