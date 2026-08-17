const prisma = require('../config/prisma');

/**
 * Records one entry in the system audit trail.
 *
 * This is intentionally "best effort": a logging failure must never break
 * the primary action the user was performing, so any error here is
 * swallowed (and logged to the console) rather than propagated.
 *
 * @param {import('express').Request} req - the current request, used to
 *   pull the acting user + tenant automatically.
 * @param {Object} opts
 * @param {string} opts.action - short verb, e.g. 'CREATE' | 'UPDATE' | 'DELETE' | 'VERIFY' | 'REJECT'
 * @param {string} opts.entityType - e.g. 'Resident' | 'Fee' | 'Payment'
 * @param {string} [opts.entityId]
 * @param {string} opts.description - human readable summary shown in the audit table
 * @param {Object} [opts.metadata] - any extra structured detail (kept out of the description)
 */
async function recordAudit(req, { action, entityType, entityId, description, metadata }) {
  try {
    const actor = req.user;
    await prisma.auditLog.create({
      data: {
        communityId: req.communityId || actor?.communityId || null,
        actorId: actor?.id || null,
        actorName: actor?.fullName || 'Unknown user',
        actorRole: actor?.role || 'ADMIN',
        action,
        entityType,
        entityId: entityId || null,
        description,
        metadata: metadata || undefined,
      },
    });
  } catch (err) {
    // Never let audit logging take down the actual request.
    // eslint-disable-next-line no-console
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { recordAudit };
