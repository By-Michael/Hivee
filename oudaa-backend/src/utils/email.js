// -----------------------------------------------------------------------
// Outbound email.
//
// Two backends, tried in this order:
//
//   1) Resend (https://resend.com), via a plain HTTPS API call — no SMTP
//      socket involved at all. This is the recommended path on Render:
//      Render's network resolves many SMTP hosts' AAAA (IPv6) records but
//      can't actually route to them, which shows up as exactly
//      "Connection timeout" even though the same SMTP credentials work
//      fine from a home/office network. An HTTPS API call doesn't hit
//      that problem. Configure with RESEND_API_KEY (+ optionally
//      RESEND_FROM).
//
//   2) SMTP via nodemailer, if Resend isn't configured. Forces IPv4
//      (family: 4) for the reason above, and sets explicit timeouts so a
//      genuinely unreachable host fails fast with a clear error instead
//      of hanging until nodemailer's much longer default.
//
// If neither is configured, this module runs in STUB MODE — the email is
// logged to the console instead of actually sent, so local dev keeps
// working without needing real mail credentials (same pattern as
// bankVerification.js's Veritas stub mode). Never throws: a failed/absent
// email should never block the API action that triggered it (e.g.
// deactivating a resident still succeeds even if the notification email
// fails to send).
// -----------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_API_URL = 'https://api.resend.com/emails';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Oudaa <no-reply@oudaa.local>';
const RESEND_FROM = process.env.RESEND_FROM || SMTP_FROM;

// SMTP connections that will never succeed (bad host, network can't route
// to it, wrong port) should fail loudly within a few seconds — not hang
// until nodemailer's much longer built-in default, which is what turns a
// misconfiguration into a request that just "spins" from the frontend's
// point of view.
const SMTP_TIMEOUT_MS = 15000;

function usingResend() {
  return Boolean(RESEND_API_KEY);
}

function isStubActive() {
  return !usingResend() && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS);
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
        // Forces the SMTP connection over IPv4. Without this, Node's DNS
        // resolver can hand nodemailer an IPv6 (AAAA) address for the
        // host that resolves fine but is completely unroutable from
        // Render's network — the TCP handshake then just hangs until it
        // times out, which is indistinguishable from a slow/down mail
        // server ("Connection timeout") even though the SMTP credentials
        // themselves are perfectly correct. Forcing IPv4 sidesteps this
        // entirely; virtually every SMTP provider still answers on IPv4.
        family: 4,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      });
    })();
  }
  return transporterPromise;
}

/**
 * Verifies the outbound email path at boot so a bad config shows up
 * immediately in the server logs instead of silently failing the first
 * time a real user requests a password reset. Never throws.
 */
async function verifyEmailTransport() {
  if (usingResend()) {
    // Resend has no separate "verify" call — a bad/revoked key only shows
    // up on the first actual send. Report it as configured-but-unverified
    // rather than pretending we checked something we didn't.
    console.log('[email] Using Resend for outbound email (RESEND_API_KEY set).');
    return { ok: true, stub: false, provider: 'resend' };
  }

  if (isStubActive()) return { ok: false, stub: true };

  try {
    const transporter = await getTransporter();
    await transporter.verify();
    console.log('[email] SMTP connection verified — outbound email is live.');
    return { ok: true, stub: false, provider: 'smtp' };
  } catch (err) {
    console.error(
      `[email] SMTP is configured but the connection/login FAILED — emails will NOT be sent until this is fixed: ${err.message}. ` +
        'If this says "Connection timeout" on a host like Render, try setting RESEND_API_KEY instead (see .env.example) — ' +
        'raw SMTP sockets are often unreliable from PaaS hosts even with correct credentials.',
    );
    return { ok: false, stub: false, provider: 'smtp', error: err.message };
  }
}

async function sendViaResend({ to, subject, text, html }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Sends an email. Resolves to { sent: boolean, stub: boolean } and never
 * rejects — callers should fire-and-forget or await without try/catch if
 * they don't care about the outcome.
 */
async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, stub: isStubActive() };

  if (isStubActive()) {
    console.warn('[email] No email provider configured — running in STUB mode, email logged instead of sent.');
    console.warn(`[email:STUB] To: ${to} | Subject: ${subject}\n${text}`);
    return { sent: false, stub: true };
  }

  if (usingResend()) {
    try {
      await sendViaResend({ to, subject, text, html });
      return { sent: true, stub: false, provider: 'resend' };
    } catch (err) {
      console.error('[email] Failed to send email via Resend:', err.message);
      return { sent: false, stub: false, provider: 'resend', error: err.message };
    }
  }

  try {
    const transporter = await getTransporter();
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { sent: true, stub: false, provider: 'smtp' };
  } catch (err) {
    console.error(
      '[email] Failed to send email via SMTP:',
      err.message,
      /timeout/i.test(err.message)
        ? '— this specific error is commonly the host network being unable to route to the SMTP server (see RESEND_API_KEY in .env.example for a more reliable alternative).'
        : '',
    );
    return { sent: false, stub: false, provider: 'smtp', error: err.message };
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
    '— Oudaa',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>Your resident account${communityName ? ` for <strong>${communityName}</strong>` : ''} has been deactivated by the committee.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>You will not be able to log in while your account is inactive. If you believe this is a mistake or would like more information, please contact the committee office.</p>
    <p>— Oudaa</p>
  `;
  return sendEmail({ to, subject, text, html });
}

/**
 * Sends a "reset your password" link. The link itself (with the raw,
 * unhashed token) is built by the caller (authController), since only it
 * knows the frontend's base URL.
 */
async function sendPasswordResetEmail({ to, fullName, resetUrl, expiresInMinutes }) {
  const subject = 'Reset your Oudaa password';
  const text = [
    `Hello ${fullName},`,
    '',
    'We received a request to reset the password on your Oudaa account.',
    `This link is valid for ${expiresInMinutes} minutes and can only be used once:`,
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your password won't be changed.",
    '',
    '— Oudaa',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>We received a request to reset the password on your Oudaa account.</p>
    <p>This link is valid for ${expiresInMinutes} minutes and can only be used once:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    <p>— Oudaa</p>
  `;
  return sendEmail({ to, subject, text, html });
}

/**
 * Confirms a password was just changed — sent on both self-service
 * (change-password) and forgot/reset-password flows, so someone whose
 * account was compromised gets a signal even if they didn't initiate it.
 */
async function sendPasswordChangedEmail({ to, fullName }) {
  const subject = 'Your Oudaa password was changed';
  const text = [
    `Hello ${fullName},`,
    '',
    'This is a confirmation that the password on your Oudaa account was just changed.',
    '',
    "If this wasn't you, please contact your community's committee office immediately.",
    '',
    '— Oudaa',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>This is a confirmation that the password on your Oudaa account was just changed.</p>
    <p>If this wasn't you, please contact your community's committee office immediately.</p>
    <p>— Oudaa</p>
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
  const text = [greeting, '', message, '', '— ' + (communityName || 'Oudaa')].join('\n');
  const html = `
    <p>${greeting}</p>
    <p>${message}</p>
    <p>— ${communityName || 'Oudaa'}</p>
  `;
  return sendEmail({ to, subject, text, html });
}

/**
 * Sent once, right when the committee adds a new resident. Carries the
 * temporary password the committee sees on screen (only ever shown to
 * them one time — see createResident) plus a direct login link, so the
 * resident can get into their account even if the committee never
 * relays the password some other way.
 */
async function sendResidentWelcomeEmail({ to, fullName, tempPassword, loginUrl, communityName }) {
  const subject = `Welcome to ${communityName || 'Oudaa'} — your account is ready`;
  const text = [
    `Hello ${fullName},`,
    '',
    `An account has been created for you${communityName ? ` in ${communityName}` : ''}. Here are your sign-in details:`,
    '',
    `Email: ${to}`,
    `Temporary password: ${tempPassword}`,
    '',
    `Sign in here: ${loginUrl}`,
    '',
    'For your security, please sign in and change this password as soon as possible.',
    '',
    '— Oudaa',
  ].join('\n');
  const html = `
    <p>Hello ${fullName},</p>
    <p>An account has been created for you${communityName ? ` in <strong>${communityName}</strong>` : ''}. Here are your sign-in details:</p>
    <p>
      <strong>Email:</strong> ${to}<br/>
      <strong>Temporary password:</strong> ${tempPassword}
    </p>
    <p><a href="${loginUrl}">Sign in to your account</a></p>
    <p>For your security, please sign in and change this password as soon as possible.</p>
    <p>— Oudaa</p>
  `;
  return sendEmail({ to, subject, text, html });
}

module.exports = {
  sendEmail,
  sendResidentDeactivatedEmail,
  sendResidentWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendNotificationEmail,
  isStubActive,
  verifyEmailTransport,
};
