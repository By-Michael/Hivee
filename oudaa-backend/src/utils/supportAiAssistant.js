// -----------------------------------------------------------------------
// "Ask Oudaa AI" — the Help & Support chat assistant.
//
// Two things make this different from groqReceiptParser.js's one-shot
// extraction calls:
//
// 1. It's taught the ENTIRE platform up front via SYSTEM_PROMPT below, so
//    it can answer "how do I..." questions for both roles without ever
//    touching the database.
//
// 2. For committee members (ADMIN) it can additionally answer questions
//    ABOUT the community's own data ("who hasn't paid this month?") by
//    calling a small fixed set of read-only tool functions — never raw
//    SQL, and never write access. Every tool implementation below is
//    hard-scoped to req.communityId (and, for resident-facing tools, to
//    the caller's own residentId) inside this file, so the model choosing
//    to call a tool can never see another community's data no matter what
//    it's asked. This is also how we keep the context window under
//    control on a large community: instead of dumping every row into the
//    prompt up front ("indexing" the whole DB into context), the model
//    fetches only the specific, capped, pre-aggregated slice it needs for
//    the question actually asked.
// -----------------------------------------------------------------------

const prisma = require('../config/prisma');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Reuse the same retirement guard as groqReceiptParser.js — keep in sync
// if Groq retires more models.
const RETIRED_GROQ_MODELS = new Set([
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'qwen/qwen3-32b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'moonshotai/kimi-k2-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'gemma2-9b-it',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'gemma-7b-it',
  'llama-3.2-1b-preview',
]);

function resolveModel(envValue, fallback, label) {
  if (envValue && RETIRED_GROQ_MODELS.has(envValue)) {
    console.warn(`[supportAiAssistant] ${label} env var is set to "${envValue}", which Groq has retired. Falling back to "${fallback}".`);
    return fallback;
  }
  return envValue || fallback;
}

// Text-only, tool-calling-capable model. Same default as the receipt
// parser's text path — override with SUPPORT_AI_MODEL if you want the
// assistant on a different (currently-active) Groq model than receipt
// parsing uses.
const SUPPORT_MODEL = resolveModel(process.env.SUPPORT_AI_MODEL || process.env.GROQ_MODEL, 'openai/gpt-oss-120b', 'SUPPORT_AI_MODEL');

const MAX_TOOL_HOOPS = 4; // hard cap on tool-call round trips per user message
const MAX_HISTORY_MESSAGES = 16; // keep the context window bounded on long saved chats

// -----------------------------------------------------------------------
// Platform knowledge. Kept in one place (not split per-role) so the model
// has full context of how the two roles relate to each other even when
// answering a role-specific question.
// -----------------------------------------------------------------------
const PLATFORM_KNOWLEDGE = `
You are "Oudaa AI", the in-app Help & Support assistant for Hivee (product name "Oudaa") — a web platform residential communities/condos/compounds use to run their committee's finances. You are shown to users inside the app's Help & Support panel.

WHO USES THIS PLATFORM
- Every account belongs to exactly one Community (a building/compound), and has a role:
  - ADMIN = a committee member. A community can have several. They manage residents, fees, payments, funds, projects, expenses, and see the audit log.
  - RESIDENT = a unit owner or renter. They see and pay their own fees, view community funds/projects/reports, and manage their own profile.
- Sensitive committee actions (like changing the community's payment account) require approval from every OTHER committee member first (a "Pending Change") — one member can never unilaterally make certain changes.

CORE MODULES
- Residents: profile, unit number, phone (used for phone login + a search key), ID number, address, owner/renter type, status (Active/Inactive/Moved out — deactivation records a reason and timestamp but preserves history).
- Fees: a named recurring or one-time charge (ONE_TIME/MONTHLY/QUARTERLY/YEARLY) with an amount and optional due day, owed by every resident.
- Payments: a resident pays toward a Fee, a Project, or a Fund (exactly one of those three). Methods: CASH, BANK_TRANSFER, MOBILE_MONEY, CARD, OTHER. Status is PENDING (freshly recorded, e.g. cash awaiting confirmation), PENDING_REVIEW (a resident's own bank self-verification came back with a soft mismatch — amount/name/threshold — and needs a human look), VERIFIED, or REJECTED. A payment can record which calendar month(s) it covers (paidForMonth).
  - "Self-verify" = the resident submits their own bank transfer details (or a screenshot Oudaa reads automatically) and the platform checks it against the bank via a third-party verification service, auto-marking it Verified when it cleanly matches or Pending Review otherwise. Self-verified payments are append-only (can't be edited/deleted) since the bank is the source of truth.
  - Manually recorded payments (a committee member logging cash/in-person payment) CAN be edited or deleted by a committee member.
- Community Payment Methods: a community can register a CBE bank account and/or a Telebirr number for residents to pay into; each has a label residents see when choosing where to send money.
- Funds: a pool of money for a purpose (e.g. "Security Fund"), optionally with a fundraising Goal. Residents can pay into a fund directly.
- Projects: a specific initiative with its own budget, belonging to (and possibly split across) one or more Funds, with status PLANNED/ONGOING/COMPLETED/CANCELLED (cancellation requires a reason).
- Expenses: money spent by the committee, categorized (SECURITY/WATER/CLEANING/MAINTENANCE/IMPROVEMENT/ADMIN/OTHER), optionally tied to a Project or directly to a Fund. Expenses are append-only — a mistake is corrected by "reversing" it (a new offsetting entry), not editing the original.
- Receipts: photos/PDFs attached to an expense; a committee member can mark one "verified" (matches the expense) — visible to the whole committee.
- Reports: financial summary (total collected / total spent / net balance), collections by fee/month, expenses by category, monthly trend.
- Audit Log: a permanent, read-only, append-only trail of every meaningful committee action — nothing in it can ever be edited or deleted, by design.
- Committee Transfer: a committee member can hand their seat to a resident; requires every other committee member's approval, then the recipient's own acceptance. Either side can decline and cancel it.
- Committee Auto-Approval: a committee member can pre-authorize their own vote on future low-stakes Pending Changes of a given type, for a limited time they choose — always has an expiry, never indefinite.

YOUR JOB
1. Answer "how do I / what does X mean / why did Y happen" questions about the platform, clearly and specifically, in plain language. Prefer short, direct, step-by-step answers pointing at real page/button names (e.g. "Go to Payments → Record payment").
2. If the user is a committee member (ADMIN) and asks something that requires looking at their OWN community's actual data (e.g. "who hasn't paid August dues", "what's our fund balance", "any pending approvals?"), use the provided tools to fetch the real, current answer instead of guessing — never invent numbers or names. Only call a tool when the question genuinely needs live data; don't call tools for how-to questions.
3. If the user is a RESIDENT, you may use the resident-scoped tools (their own payment history, outstanding fees, community funds/projects overview) but you never have access to other residents' data or committee-only actions — if asked for something committee-only, explain that this needs a committee member.
4. Never make up figures, names, or statuses. If a tool returns nothing relevant, say so plainly.
5. Keep answers concise — a few short sentences or a tight list. Use the resident/committee member's own language register: friendly, plain, not corporate.
6. You cannot make any changes to the account or data yourself (no editing, creating, approving, or deleting anything) — you are read-only. If someone asks you to DO something (approve a payment, edit a fee, etc.), tell them which page/button does that instead of pretending to do it.
7. If asked something entirely unrelated to Hivee/Oudaa, answer briefly if you can, but steer back to what you're there for.
`.trim();

// -----------------------------------------------------------------------
// Tool definitions (OpenAI/Groq function-calling format) — split by role.
// Every tool is read-only and every executor below re-derives its own
// scope from the authenticated request; nothing here trusts arguments
// the model supplies for scoping (communityId/residentId are never
// tool parameters).
// -----------------------------------------------------------------------

const ADMIN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_unpaid_residents',
      description: "List residents who have NOT paid a given fee for a given month (or overall, if month is omitted). Use this for questions like 'who hasn't paid August dues' or 'who owes us money'.",
      parameters: {
        type: 'object',
        properties: {
          feeName: { type: 'string', description: 'Fee name to match (case-insensitive, partial match ok), e.g. "Monthly Dues". Omit to check across all fees.' },
          month: { type: 'string', description: 'Month in YYYY-MM format, e.g. "2026-08". Omit to just check whether they have ever paid this fee at all.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_financial_summary',
      description: 'Get the community\u2019s current headline financial numbers: total collected, total spent, net balance, pending payment count, active project count, and per-fund balances.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_payments',
      description: 'List payments currently awaiting committee action (status PENDING or PENDING_REVIEW), most recent first.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Max rows to return, default 20, max 50.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resident_info',
      description: 'Look up a specific resident by name or unit number and return their profile, payment history summary, and any outstanding fees.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Resident full name (partial ok) or unit number.' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pending_committee_approvals',
      description: 'List sensitive committee actions currently awaiting approval (Pending Changes) and any pending committee-seat transfer requests.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_recent_expenses',
      description: 'List the community\u2019s most recent recorded expenses, optionally filtered by category.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max rows, default 15, max 50.' },
          category: { type: 'string', description: 'One of SECURITY, WATER, CLEANING, MAINTENANCE, IMPROVEMENT, ADMIN, OTHER. Omit for all.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_audit_log_summary',
      description: 'Get the most recent audit log entries (who did what, and when) for this community.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Max rows, default 15, max 50.' } },
      },
    },
  },
];

const RESIDENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_my_payment_history',
      description: 'Get the current user\u2019s own recent payments and their statuses.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Max rows, default 15, max 50.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_outstanding_fees',
      description: 'Get the fees the current user has not yet paid (or paid for).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_community_funds_overview',
      description: 'Get the community\u2019s funds, their goals, and current balances.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_community_projects_overview',
      description: 'Get the community\u2019s projects, their status and budget.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

function capLimit(n, fallback, max) {
  const v = Number.isFinite(Number(n)) ? Math.floor(Number(n)) : fallback;
  return Math.max(1, Math.min(v || fallback, max));
}

// -----------------------------------------------------------------------
// Tool executors. `ctx` = { communityId, user } from the authenticated
// request — never derived from model-supplied arguments.
// -----------------------------------------------------------------------

async function toolListUnpaidResidents(ctx, args) {
  const { communityId } = ctx;
  const feeWhere = { communityId };
  if (args.feeName) feeWhere.name = { contains: args.feeName, mode: 'insensitive' };
  const fees = await prisma.fee.findMany({ where: feeWhere, take: 10 });
  if (fees.length === 0) return { message: 'No matching fee found for this community.' };

  const residents = await prisma.resident.findMany({
    where: { user: { communityId }, status: 'ACTIVE' },
    include: { user: { select: { fullName: true } } },
  });

  const results = [];
  for (const fee of fees) {
    const paymentWhere = { feeId: fee.id, status: { not: 'REJECTED' } };
    if (args.month) paymentWhere.paidForMonth = { contains: args.month };
    const payments = await prisma.payment.findMany({ where: paymentWhere, select: { residentId: true } });
    const paidResidentIds = new Set(payments.map((p) => p.residentId));
    const unpaid = residents
      .filter((r) => !paidResidentIds.has(r.id))
      .map((r) => ({ name: r.user.fullName, unitNumber: r.unitNumber }));
    results.push({ fee: fee.name, amount: String(fee.amount), month: args.month || 'any', unpaidCount: unpaid.length, unpaidResidents: unpaid.slice(0, 50) });
  }
  return { results };
}

async function toolGetFinancialSummary(ctx) {
  const { communityId } = ctx;
  const [totalCollected, totalExpenses, pendingPayments, activeProjects, funds] = await Promise.all([
    prisma.payment.aggregate({ where: { communityId, status: 'VERIFIED' }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { communityId }, _sum: { amount: true } }),
    prisma.payment.count({ where: { communityId, status: { in: ['PENDING', 'PENDING_REVIEW'] } } }),
    prisma.project.count({ where: { communityId, status: 'ONGOING' } }),
    prisma.fund.findMany({ where: { communityId }, select: { id: true, name: true, goal: true } }),
  ]);

  const fundBalances = [];
  for (const fund of funds) {
    const [directPayments, projectPayments, directExpenses, projectExpenses] = await Promise.all([
      prisma.payment.aggregate({ where: { fundId: fund.id, status: 'VERIFIED' }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { project: { fundId: fund.id }, status: 'VERIFIED' }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { fundId: fund.id }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { project: { fundId: fund.id } }, _sum: { amount: true } }),
    ]);
    const collected = Number(directPayments._sum.amount || 0) + Number(projectPayments._sum.amount || 0);
    const spent = Number(directExpenses._sum.amount || 0) + Number(projectExpenses._sum.amount || 0);
    fundBalances.push({ fund: fund.name, goal: fund.goal ? String(fund.goal) : null, collected, spent, balance: collected - spent });
  }

  return {
    totalCollected: Number(totalCollected._sum.amount || 0),
    totalExpenses: Number(totalExpenses._sum.amount || 0),
    netBalance: Number(totalCollected._sum.amount || 0) - Number(totalExpenses._sum.amount || 0),
    pendingPayments,
    activeProjects,
    fundBalances,
  };
}

async function toolListPendingPayments(ctx, args) {
  const take = capLimit(args.limit, 20, 50);
  const payments = await prisma.payment.findMany({
    where: { communityId: ctx.communityId, status: { in: ['PENDING', 'PENDING_REVIEW'] } },
    include: { resident: { include: { user: { select: { fullName: true } } } }, fee: { select: { name: true } }, project: { select: { name: true } }, fund: { select: { name: true } } },
    orderBy: { paidAt: 'desc' },
    take,
  });
  return {
    payments: payments.map((p) => ({
      resident: p.resident?.user?.fullName,
      unit: p.resident?.unitNumber,
      amount: String(p.amount),
      for: p.fee?.name || p.project?.name || p.fund?.name || 'unspecified',
      status: p.status,
      reviewFlags: p.reviewFlags,
      paidAt: p.paidAt,
    })),
  };
}

async function toolGetResidentInfo(ctx, args) {
  const { communityId } = ctx;
  const query = String(args.query || '').trim();
  if (!query) return { message: 'No search term given.' };

  const resident = await prisma.resident.findFirst({
    where: {
      user: { communityId },
      OR: [
        { user: { fullName: { contains: query, mode: 'insensitive' } } },
        { unitNumber: { contains: query, mode: 'insensitive' } },
      ],
    },
    include: {
      user: { select: { fullName: true, email: true } },
      payments: { orderBy: { paidAt: 'desc' }, take: 10, include: { fee: { select: { name: true } } } },
    },
  });
  if (!resident) return { message: `No resident found matching "${query}".` };

  const fees = await prisma.fee.findMany({ where: { communityId } });
  const paidFeeIds = new Set(resident.payments.filter((p) => p.status !== 'REJECTED').map((p) => p.feeId));
  const outstandingFees = fees.filter((f) => !paidFeeIds.has(f.id)).map((f) => f.name);

  return {
    name: resident.user.fullName,
    email: resident.user.email,
    unitNumber: resident.unitNumber,
    status: resident.status,
    ownerType: resident.ownerType,
    recentPayments: resident.payments.map((p) => ({ for: p.fee?.name || '(project/fund payment)', amount: String(p.amount), status: p.status, paidAt: p.paidAt })),
    outstandingFees,
  };
}

async function toolListPendingCommitteeApprovals(ctx) {
  const { communityId } = ctx;
  const [pendingChanges, transfers] = await Promise.all([
    prisma.pendingChange.findMany({ where: { communityId, status: 'PENDING' }, include: { proposedBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.committeeTransferRequest.findMany({ where: { communityId, status: { in: ['PENDING_COMMITTEE', 'PENDING_RECIPIENT'] } }, include: { fromUser: { select: { fullName: true } }, toResident: { include: { user: { select: { fullName: true } } } } }, take: 10 }),
  ]);
  return {
    pendingChanges: pendingChanges.map((c) => ({ changeType: c.changeType, proposedBy: c.proposedBy?.fullName, createdAt: c.createdAt, expiresAt: c.expiresAt })),
    pendingCommitteeTransfers: transfers.map((t) => ({ from: t.fromUser?.fullName, to: t.toResident?.user?.fullName, status: t.status })),
  };
}

async function toolListRecentExpenses(ctx, args) {
  const take = capLimit(args.limit, 15, 50);
  const where = { communityId: ctx.communityId, isVoided: false };
  if (args.category) where.category = String(args.category).toUpperCase();
  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { spentAt: 'desc' },
    take,
    include: { project: { select: { name: true } }, fund: { select: { name: true } } },
  });
  return {
    expenses: expenses.map((e) => ({
      category: e.category,
      amount: String(e.amount),
      vendor: e.vendor,
      description: e.description,
      for: e.project?.name || e.fund?.name || 'general',
      spentAt: e.spentAt,
    })),
  };
}

async function toolGetAuditLogSummary(ctx, args) {
  const take = capLimit(args.limit, 15, 50);
  const logs = await prisma.auditLog.findMany({ where: { communityId: ctx.communityId }, orderBy: { createdAt: 'desc' }, take });
  return { entries: logs.map((l) => ({ actor: l.actorName, action: l.action, entityType: l.entityType, description: l.description, createdAt: l.createdAt })) };
}

// --- Resident-scoped tools -------------------------------------------------

async function requireResident(ctx) {
  const resident = await prisma.resident.findUnique({ where: { userId: ctx.user.id } });
  return resident;
}

async function toolGetMyPaymentHistory(ctx, args) {
  const resident = await requireResident(ctx);
  if (!resident) return { message: 'No resident profile found for this account.' };
  const take = capLimit(args.limit, 15, 50);
  const payments = await prisma.payment.findMany({
    where: { residentId: resident.id },
    orderBy: { paidAt: 'desc' },
    take,
    include: { fee: { select: { name: true } }, project: { select: { name: true } }, fund: { select: { name: true } } },
  });
  return {
    payments: payments.map((p) => ({ for: p.fee?.name || p.project?.name || p.fund?.name || 'unspecified', amount: String(p.amount), status: p.status, paidAt: p.paidAt })),
  };
}

async function toolGetMyOutstandingFees(ctx) {
  const resident = await requireResident(ctx);
  if (!resident) return { message: 'No resident profile found for this account.' };
  const [fees, payments] = await Promise.all([
    prisma.fee.findMany({ where: { communityId: ctx.communityId } }),
    prisma.payment.findMany({ where: { residentId: resident.id, status: { not: 'REJECTED' } }, select: { feeId: true } }),
  ]);
  const paidFeeIds = new Set(payments.map((p) => p.feeId));
  const outstanding = fees.filter((f) => !paidFeeIds.has(f.id)).map((f) => ({ name: f.name, amount: String(f.amount), frequency: f.frequency }));
  return { outstandingFees: outstanding };
}

async function toolGetCommunityFundsOverview(ctx) {
  const funds = await prisma.fund.findMany({ where: { communityId: ctx.communityId }, select: { name: true, category: true, goal: true, description: true } });
  return { funds: funds.map((f) => ({ name: f.name, category: f.category, goal: f.goal ? String(f.goal) : null, description: f.description })) };
}

async function toolGetCommunityProjectsOverview(ctx) {
  const projects = await prisma.project.findMany({ where: { communityId: ctx.communityId }, select: { name: true, status: true, budget: true, description: true } });
  return { projects: projects.map((p) => ({ name: p.name, status: p.status, budget: String(p.budget), description: p.description })) };
}

const ADMIN_EXECUTORS = {
  list_unpaid_residents: toolListUnpaidResidents,
  get_financial_summary: toolGetFinancialSummary,
  list_pending_payments: toolListPendingPayments,
  get_resident_info: toolGetResidentInfo,
  list_pending_committee_approvals: toolListPendingCommitteeApprovals,
  list_recent_expenses: toolListRecentExpenses,
  get_audit_log_summary: toolGetAuditLogSummary,
};

const RESIDENT_EXECUTORS = {
  get_my_payment_history: toolGetMyPaymentHistory,
  get_my_outstanding_fees: toolGetMyOutstandingFees,
  get_community_funds_overview: toolGetCommunityFundsOverview,
  get_community_projects_overview: toolGetCommunityProjectsOverview,
};

function toolsForRole(role) {
  return role === 'ADMIN' ? ADMIN_TOOLS : RESIDENT_TOOLS;
}

function executorsForRole(role) {
  return role === 'ADMIN' ? ADMIN_EXECUTORS : RESIDENT_EXECUTORS;
}

async function callGroq(apiKey, body) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq API request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Runs one turn of the support chat: takes prior history + the new user
 * message, lets the model optionally call tools (scoped to `ctx`), and
 * returns the final assistant text reply.
 *
 * @param {{communityId: string, user: {id: string, role: string, fullName: string}}} ctx
 * @param {{role: 'user'|'assistant', content: string}[]} history - prior turns, oldest first (already capped by caller)
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function runSupportChat(ctx, history, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('Support AI is not configured on this server yet.'), { code: 'NOT_CONFIGURED' });
  }

  const roleLabel = ctx.user.role === 'ADMIN' ? 'a committee member (ADMIN)' : 'a resident';
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);

  const messages = [
    { role: 'system', content: `${PLATFORM_KNOWLEDGE}\n\nThe person you're talking to is ${roleLabel} named ${ctx.user.fullName}.` },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const tools = toolsForRole(ctx.user.role);
  const executors = executorsForRole(ctx.user.role);

  for (let hop = 0; hop < MAX_TOOL_HOOPS; hop++) {
    const data = await callGroq(apiKey, {
      model: SUPPORT_MODEL,
      temperature: 0.3,
      max_tokens: 800,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = data?.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error('Support AI returned an empty response.');

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      return (msg.content || '').trim() || "I don't have a good answer for that yet — try rephrasing, or reach out to your committee directly.";
    }

    // Assistant's tool-call turn must be echoed back before the tool results.
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const fnName = call.function?.name;
      let args = {};
      try {
        args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }

      const executor = executors[fnName];
      let result;
      if (!executor) {
        result = { error: `Unknown or unavailable tool "${fnName}" for this role.` };
      } else {
        try {
          result = await executor(ctx, args);
        } catch (err) {
          result = { error: `Tool failed: ${err.message}` };
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 6000), // guard against a runaway result blowing the context window
      });
    }
  }

  return "I looked into that but couldn't pin down a confident answer in time — try narrowing the question (a specific resident name, fee, or month).";
}

module.exports = { runSupportChat, isConfigured };
