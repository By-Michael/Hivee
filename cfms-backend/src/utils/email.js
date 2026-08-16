// -----------------------------------------------------------------------
// Outbound email.
//
// Backed by SMTP (via nodemailer) when SMTP_HOST/SMTP_USER/SMTP_PASS are
// configured. If they aren't, this module runs in STUB MODE — the email
// is logged to the console instead of actually sent, so local dev keeps
// working without needing real mail credentials (same pattern as
// bankVerification.js's Veritas stub mode). Never throws: a failed/absent
// email should never block the API action that triggered it (e.g.
// deactivating a resident still succeeds even if the notification email
// fails to send).
// -----------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'CFMS <no-reply@cfms.local>';

function isStubActive() {
  return !SMTP_HOST || !SMTP_USER || !SMTP_PASS;
}

let transporterPromise = null;
function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      // eslint-disable-next-line global-require
      const nodemailer = require('nodemailer');
      return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
    })();
  }
  return transporterPromise;
}

/**
 * Sends an email. Resolves to { sent: boolean, stub: boolean } and never
 * rejects — callers should fire-and-forget or await without try/catch if
 * they don't care about the outcome.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, stub: isStubActive() };

  if (isStubActive()) {
    console.warn('[email] SMTP not configured — running in STUB mode, email logged instead of sent.');
    console.warn(`[email:STUB] To: ${to} | Subject: ${subject}\n${text}`);
    return { sent: false, stub: true };
  }

  try {
    const transporter = await getTransporter();
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { sent: true, stub: false };
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
    return { sent: false, stub: false, error: err.message };
  }
}

/**
 * Notifies a resident that their account was deactivated, and why.
 */
async function sendResidentDeactivatedEmail({ to, fullName, reason, communityName }) {
  const subject = `Your ${communityName || 'community'} account has been deactivated`;
  const text = [
    `Hello ${fullName},`,
    '',
    `Your resident account${communityName ? ` for ${communityName}` : ''} has been deactivated by the committee.`,
    '',
    `Reason: ${reason}`,
    '',
    'You will not be able to log in while your account is inactive. If you believe this is a mistake or would like more information, please contact the committee office.',
    '',
    '— CFMS',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>Your resident account${communityName ? ` for <strong>${communityName}</strong>` : ''} has been deactivated by the committee.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>You will not be able to log in while your account is inactive. If you believe this is a mistake or would like more information, please contact the committee office.</p>
    <p>— CFMS</p>
  `;
  return sendEmail({ to, subject, text, html });
}

/**
 * Sends a "reset your password" link. The link itself (with the raw,
 * unhashed token) is built by the caller (authController), since only it
 * knows the frontend's base URL.
 */
async function sendPasswordResetEmail({ to, fullName, resetUrl, expiresInMinutes }) {
  const subject = 'Reset your CFMS password';
  const text = [
    `Hello ${fullName},`,
    '',
    'We received a request to reset the password on your CFMS account.',
    `This link is valid for ${expiresInMinutes} minutes and can only be used once:`,
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your password won't be changed.",
    '',
    '— CFMS',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>We received a request to reset the password on your CFMS account.</p>
    <p>This link is valid for ${expiresInMinutes} minutes and can only be used once:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    <p>— CFMS</p>
  `;
  return sendEmail({ to, subject, text, html });
}

/**
 * Confirms a password was just changed — sent on both self-service
 * (change-password) and forgot/reset-password flows, so someone whose
 * account was compromised gets a signal even if they didn't initiate it.
 */
async function sendPasswordChangedEmail({ to, fullName }) {
  const subject = 'Your CFMS password was changed';
  const text = [
    `Hello ${fullName},`,
    '',
    'This is a confirmation that the password on your CFMS account was just changed.',
    '',
    "If this wasn't you, please contact your community's committee office immediately.",
    '',
    '— CFMS',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>This is a confirmation that the password on your CFMS account was just changed.</p>
    <p>If this wasn't you, please contact your community's committee office immediately.</p>
    <p>— CFMS</p>
  `;
  return sendEmail({ to, subject, text, html });
}

/**
 * General-purpose notification email — for one-off announcements
 * (fee due, payment verified, expense logged against a project the
 * resident follows, etc.) that don't warrant their own dedicated
 * template. Callers pass already-composed copy.
 */
async function sendNotificationEmail({ to, fullName, subject, message, communityName }) {
  const greeting = fullName ? `Hello ${fullName},` : 'Hello,';
  const text = [greeting, '', message, '', '— ' + (communityName || 'CFMS')].join('\n');
  const html = `
    <p>${greeting}</p>
    <p>${message}</p>
    <p>— ${communityName || 'CFMS'}</p>
  `;
  return sendEmail({ to, subject, text, html });
}

module.exports = {
  sendEmail,
  sendResidentDeactivatedEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendNotificationEmail,
  isStubActive,
};
