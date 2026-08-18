const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const path = require('path');
const rateLimit = require('express-rate-limit');

const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const communityRoutes = require('./routes/communityRoutes');
const residentRoutes = require('./routes/residentRoutes');
const feeRoutes = require('./routes/feeRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const fundRoutes = require('./routes/fundRoutes');
const projectRoutes = require('./routes/projectRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const committeeTransferRoutes = require('./routes/committeeTransferRoutes');
const pendingChangeRoutes = require('./routes/pendingChangeRoutes');
const auditRoutes = require('./routes/auditRoutes');
const committeeAutoApprovalRoutes = require('./routes/committeeAutoApprovalRoutes');

const app = express();

// Render (and most PaaS hosts) put the app behind a reverse proxy, so every
// request arrives with an X-Forwarded-For header. Without telling Express
// to trust it, express-rate-limit refuses to key off it at all and throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR instead of silently misidentifying
// clients — seen crashing rate-limited requests in the Render logs.
// `1` = trust exactly one hop (Render's own proxy), not an open-ended chain.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');
app.use(helmet());
// Login triggers ~9 parallel list requests (fees/funds/projects/expenses/
// payments/residents/community/fund-summaries/pending-changes), several of
// which can be a few hundred KB of JSON for a mid-size community. gzip
// compression was missing entirely, so every one of those responses went
// over the wire uncompressed — this alone typically cuts JSON payload size
// by 70-85%, which is most of what "long data crunching after login" was:
// not server compute, but transfer + JSON.parse time on plain-text bodies
// several times larger than they needed to be.
app.use(compression());
// credentials: true (required so the httpOnly refresh cookie survives a
// cross-origin request between the Render frontend/backend services) is
// fundamentally incompatible with a wildcard '*' origin — browsers refuse
// to expose credentialed responses to a wildcard-origin request, so the
// cookie silently never round-trips and /auth/refresh fails, logging
// everyone out ~15 minutes in ("Your session expired") even though nothing
// is actually wrong. Previously this fell back to '*' when CORS_ORIGIN was
// unset, which hid the misconfiguration behind an unrelated-looking
// symptom. Support a comma-separated list (e.g. prod + a preview URL) and
// fail loudly at boot instead, since a silent '*' fallback is worse than a
// crash here.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (CORS_ORIGINS.length === 0) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ORIGIN env var is not set. It must be your frontend URL (e.g. https://app.example.com), ' +
        'or a comma-separated list of allowed origins. A wildcard cannot be used because auth relies on ' +
        'a credentialed (cookie-based) cross-origin request.'
    );
  }
  console.warn('[cors] CORS_ORIGIN not set — defaulting to http://localhost:5173 for local dev.');
  CORS_ORIGINS.push('http://localhost:5173');
}

console.log(`[cors] Allowing origin(s): ${CORS_ORIGINS.join(', ')}`);
app.use(
  cors({
    origin(origin, callback) {
      // Same-origin/non-browser requests (curl, health checks) send no
      // Origin header at all — allow those through.
      if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS_ORIGIN`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// General API rate limit (auth routes have their own stricter limiter).
// Note: a single dashboard refresh can fan out into a dozen+ parallel
// requests (one per fund summary, plus fees/funds/projects/expenses/
// payments/residents), and the client silently re-syncs every 60s, so
// this needs real headroom — 300/15min was getting tripped by normal use.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 1500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please slow down and try again shortly.' },
  })
);

// Uploaded receipt files served statically.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date() }));

const API_PREFIX = '/api/v1';
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/communities`, communityRoutes);
app.use(`${API_PREFIX}/residents`, residentRoutes);
app.use(`${API_PREFIX}/fees`, feeRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/funds`, fundRoutes);
app.use(`${API_PREFIX}/projects`, projectRoutes);
app.use(`${API_PREFIX}/expenses`, expenseRoutes);
app.use(`${API_PREFIX}/receipts`, receiptRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/committee-transfers`, committeeTransferRoutes);
app.use(`${API_PREFIX}/pending-changes`, pendingChangeRoutes);
app.use(`${API_PREFIX}/audit-logs`, auditRoutes);
app.use(`${API_PREFIX}/committee-auto-approvals`, committeeAutoApprovalRoutes);

// Unmatched routes.
app.use((req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
});

app.use(errorHandler);

module.exports = app;
