require('dotenv').config();
const app = require('./app');
const prisma = require('./config/prisma');
const { isStubActive } = require('./utils/bankVerification');

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

const server = app.listen(PORT, () => {
  console.log(`CFMS backend listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
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
