require('dotenv').config();
const app = require('./app');
const prisma = require('./config/prisma');
const { isStubActive } = require('./utils/bankVerification');
const { isStubActive: isEmailStubActive, verifyEmailTransport } = require('./utils/email');
const { isSupabaseConfigured } = require('./config/storage');
const { isStubActive: isOcrStubActive } = require('./utils/ocrReceipt');
const { isStubActive: isGroqStubActive } = require('./utils/groqReceiptParser');

const PORT = process.env.PORT || 4000;

if (isStubActive()) {
  const banner = [
    '',
    '#############################################################',
    '#  WARNING: VERITAS_API_KEY is not set.                     #',
    '#  Bank transaction verification is running in STUB MODE —  #',
    '#  self-verified resident payments are NOT being checked    #',
    '#  against a real bank. Do not run this way in production.  #',
    '#############################################################',
    '',
  ].join('\n');
  if (process.env.NODE_ENV === 'production') {
    console.error(banner);
  } else {
    console.warn(banner);
  }
}

if (isEmailStubActive()) {
  const banner = [
    '',
    '#############################################################',
    '#  WARNING: BREVO_API_KEY / BREVO_SENDER_EMAIL not set.      #',
    '#  Outbound email (password resets, deactivation notices,   #',
    '#  etc.) is running in STUB MODE — emails are only logged   #',
    '#  to the console, never actually sent. Password-reset      #',
    '#  links will NOT reach real users while this is active.    #',
    '#  Set BREVO_API_KEY / BREVO_SENDER_EMAIL / BREVO_SENDER_NAME#',
    '#  before relying on email in production.                    #',
    '#############################################################',
    '',
  ].join('\n');
  if (process.env.NODE_ENV === 'production') {
    console.error(banner);
  } else {
    console.warn(banner);
  }
} else {
  // Brevo creds are present — verify they actually authenticate, rather
  // than waiting for the first real password-reset request to find out.
  verifyEmailTransport();
}

if (!isSupabaseConfigured) {
  const banner = [
    '',
    '#############################################################',
    '#  WARNING: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.#',
    '#  Receipt uploads are being written to local disk, which   #',
    '#  is WIPED on every deploy/restart on Render. Every         #',
    '#  receipt uploaded this way will 404 after the next deploy.#',
    '#  Set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY before       #',
    '#  relying on receipt uploads in production.                 #',
    '#############################################################',
    '',
  ].join('\n');
  if (process.env.NODE_ENV === 'production') {
    console.error(banner);
  } else {
    console.warn(banner);
  }
}

if (isOcrStubActive()) {
  const banner = [
    '',
    '#############################################################',
    '#  WARNING: Neither GROQ_API_KEY nor OCRSPACE_API_KEY is set. #',
    '#  Receipt-screenshot autofill is DISABLED — any attempt to  #',
    '#  use it will fail with an error (this is not a silent      #',
    '#  mock, it hard-fails). Set GROQ_API_KEY (preferred, vision- #',
    '#  based, no OCR.space dependency) or OCRSPACE_API_KEY.       #',
    '#############################################################',
    '',
  ].join('\n');
  if (process.env.NODE_ENV === 'production') {
    console.error(banner);
  } else {
    console.warn(banner);
  }
}

if (isGroqStubActive()) {
  const banner = [
    '',
    '#############################################################',
    '#  WARNING: GROQ_API_KEY is not set.                         #',
    '#  Receipt autofill is running in REGEX-ONLY mode — only     #',
    '#  transaction ID and sender name are extracted; amount,     #',
    '#  bank name, and date will NOT be autofilled. Set           #',
    '#  GROQ_API_KEY for full structured extraction.              #',
    '#############################################################',
    '',
  ].join('\n');
  if (process.env.NODE_ENV === 'production') {
    console.warn(banner);
  } else {
    console.warn(banner);
  }
}

const server = app.listen(PORT, () => {
  console.log(`Oudaa backend listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});
