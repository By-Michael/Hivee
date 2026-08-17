/**
 * Bulk seed script for load / integrity testing.
 *
 * Unlike seed.js (small, readable, one row at a time), this uses
 * createMany() in chunks so it can push thousands of rows without
 * taking forever or blowing up memory. IDs are generated client-side
 * with crypto.randomUUID() so we can wire up relations (residentId,
 * feeId, etc.) BEFORE the rows exist in the DB, which is what lets us
 * use createMany() instead of one create() per row.
 *
 * Configure via env vars (all optional, sane defaults below):
 *   RESIDENTS=5000 FUNDS=20 PROJECTS=300 EXPENSES=8000 node prisma/seed-large.js
 *
 * Run from odaa-backend/:
 *   node prisma/seed-large.js
 *
 * NOTE: this wipes existing data first (same as seed.js) so it's
 * repeatable. Comment out the "RESET" block below if you want to
 * layer on top of existing data instead.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

// ---------------------------------------------------------------------------
// Config (override via env vars)
// ---------------------------------------------------------------------------
const RESIDENTS = parseInt(process.env.RESIDENTS || '5000', 10);
const MAX_PAYMENTS_PER_RESIDENT = parseInt(process.env.MAX_PAYMENTS_PER_RESIDENT || '8', 10);
const FUNDS = parseInt(process.env.FUNDS || '20', 10);
const PROJECTS = parseInt(process.env.PROJECTS || '300', 10);
const EXPENSES = parseInt(process.env.EXPENSES || '8000', 10);
const AUDIT_LOGS = parseInt(process.env.AUDIT_LOGS || '5000', 10);
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '2000', 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const uuid = () => crypto.randomUUID();

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randDecimal(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
function randDateBetween(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.|\.$)/g, '');
}
function phoneSearchKeyFor(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-9);
}

// Insert `rows` via createMany in batches of CHUNK_SIZE so we don't hold
// everything in one giant query or blow past driver payload limits.
async function bulkInsert(model, rows, label) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const batch = rows.slice(i, i + CHUNK_SIZE);
    await prisma[model].createMany({ data: batch, skipDuplicates: true });
    inserted += batch.length;
    process.stdout.write(`\r  ${label}: ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');
}

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
  'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Selam', 'Abebe',
  'Kalkidan', 'Bereket', 'Hana', 'Yonas', 'Meron', 'Dawit', 'Ruth', 'Samuel',
  'Helen', 'Girma', 'Tigist', 'Solomon', 'Rahel', 'Elias', 'Sara', 'Nathan',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Tesfaye', 'Alemu', 'Bekele',
  'Girma', 'Haile', 'Kebede', 'Mekonnen', 'Tadesse', 'Wolde', 'Yohannes',
];
const VENDORS = [
  'Greenwood Hardware Co.', 'BlueSky Landscaping', 'CityGuard Security',
  'AquaPure Water Services', 'Sparkle Cleaning Ltd.', 'FixIt Maintenance',
  'BrightPath Electric', 'Metro Paving Works', 'EcoWaste Solutions', 'SafeGate Systems',
];
const PROJECT_NAME_ROOTS = [
  'Perimeter Wall Repair', 'Playground Renovation', 'Solar Lighting Upgrade',
  'Clubhouse Roof Repair', 'Swimming Pool Resurfacing', 'CCTV Expansion',
  'Garden & Landscaping Overhaul', 'Parking Lot Repaving', 'Water Tank Installation',
  'Community Hall Renovation', 'Gate Automation', 'Drainage System Upgrade',
];
const FEE_DEFS = [
  { name: 'Monthly Security Fee', frequency: 'MONTHLY', amount: [40, 70] },
  { name: 'Monthly Maintenance Fee', frequency: 'MONTHLY', amount: [30, 60] },
  { name: 'Quarterly Landscaping Fee', frequency: 'QUARTERLY', amount: [90, 150] },
  { name: 'Annual Amenities Fee', frequency: 'YEARLY', amount: [200, 400] },
  { name: 'Special Assessment - Roof Fund', frequency: 'ONE_TIME', amount: [100, 300] },
];
const EXPENSE_DESCRIPTIONS = [
  'Monthly guard staffing', 'Water pump repair', 'Paint & supplies',
  'Tree trimming and disposal', 'CCTV camera units', 'Cement and gravel',
  'Electrical wiring', 'Playground equipment', 'Generator servicing',
  'Waste collection contract', 'Gate motor replacement', 'Pipe fittings',
];
const CATEGORIES = ['SECURITY', 'WATER', 'CLEANING', 'MAINTENANCE', 'IMPROVEMENT', 'ADMIN', 'OTHER'];
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER'];
const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'VERIFY', 'REJECT', 'LOGIN'];
const AUDIT_ENTITY_TYPES = ['Resident', 'Fee', 'Payment', 'Fund', 'Project', 'Expense'];

async function main() {
  const startedAt = Date.now();
  console.log(`Seeding: ${RESIDENTS} residents, up to ${MAX_PAYMENTS_PER_RESIDENT} payments each, ${FUNDS} funds, ${PROJECTS} projects, ${EXPENSES} expenses, ${AUDIT_LOGS} audit logs.`);

  const passwordHash = await bcrypt.hash('Password123!', 12);

  // -------------------------------------------------------------------
  // Reset (children first, respecting FK order) so the seed is repeatable
  // -------------------------------------------------------------------
  console.log('Resetting existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.pendingChangeApproval.deleteMany();
  await prisma.pendingChange.deleteMany();
  await prisma.committeeTransferApproval.deleteMany();
  await prisma.committeeTransferRequest.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.fund.deleteMany();
  await prisma.fee.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.user.deleteMany();
  await prisma.community.deleteMany();

  // -------------------------------------------------------------------
  // Community + admins
  // -------------------------------------------------------------------
  const community = await prisma.community.create({
    data: {
      name: 'Greenwood Estate',
      address: '123 Greenwood Ave, Addis Ababa',
      contactInfo: 'committee@greenwood.example',
      paymentBankName: 'Commercial Bank of Ethiopia',
      paymentAccountName: 'Greenwood Estate Residents Committee',
      paymentAccountNumber: '1000123456789',
      autoVerifyMaxAmount: 500,
    },
  });

  const admin = await prisma.user.create({
    data: {
      communityId: community.id,
      fullName: 'Alice Admin',
      email: 'admin@greenwood.example',
      passwordHash,
      role: 'ADMIN',
    },
  });

  await prisma.user.create({
    data: {
      communityId: community.id,
      fullName: 'Yonas Committee',
      email: 'yonas.committee@greenwood.example',
      passwordHash,
      role: 'ADMIN',
    },
  });

  // -------------------------------------------------------------------
  // Residents — RESIDENTS worth of User + Resident rows.
  // Users and Residents are separate models, so we build both arrays with
  // pre-generated UUIDs and createMany() each, rather than doing RESIDENTS
  // sequential nested-create() calls (which is what made the small seed
  // slow at any real scale).
  // -------------------------------------------------------------------
  console.log(`Building ${RESIDENTS} users + residents...`);
  const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'MOVED_OUT'];
  const usedEmails = new Set(['admin@greenwood.example', 'yonas.committee@greenwood.example']);
  const userRows = [];
  const residentRows = [];

  for (let i = 0; i < RESIDENTS; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const fullName = `${first} ${last}`;
    let email = `${slugify(first)}.${slugify(last)}${i}@greenwood.example`;
    while (usedEmails.has(email)) {
      email = `${slugify(first)}.${slugify(last)}${i}.${randInt(1000, 9999)}@greenwood.example`;
    }
    usedEmails.add(email);

    const userId = uuid();
    const block = String.fromCharCode(65 + (i % 8)); // A-H
    const unitNumber = `${block}-${String(100 + i)}`;
    const phone = `09${randInt(10000000, 99999999)}`;

    userRows.push({
      id: userId,
      communityId: community.id,
      fullName,
      email,
      passwordHash,
      role: 'RESIDENT',
    });

    residentRows.push({
      id: uuid(),
      userId,
      unitNumber,
      phone,
      phoneSearchKey: phoneSearchKeyFor(phone),
      idNumber: `ID${randInt(1000000, 9999999)}`,
      address: `${unitNumber}, Greenwood Estate`,
      ownerType: Math.random() < 0.7 ? 'OWNER' : 'RENTER',
      status: pick(statuses),
      joinedAt: randDateBetween(daysAgo(1200), daysAgo(1)),
    });
  }

  await bulkInsert('user', userRows, 'users');
  await bulkInsert('resident', residentRows, 'residents');

  // Keep the well-known demo login working
  const demoUser = await prisma.user.create({
    data: {
      communityId: community.id,
      fullName: 'Bob Resident',
      email: 'bob@greenwood.example',
      passwordHash,
      role: 'RESIDENT',
      resident: { create: { unitNumber: 'A-101-DEMO', status: 'ACTIVE' } },
    },
    include: { resident: true },
  });
  residentRows.push({ id: demoUser.resident.id });

  // -------------------------------------------------------------------
  // Fees
  // -------------------------------------------------------------------
  const feeRows = FEE_DEFS.map((f) => ({
    id: uuid(),
    communityId: community.id,
    name: f.name,
    amount: randDecimal(f.amount[0], f.amount[1]),
    frequency: f.frequency,
    dueDay: f.frequency === 'ONE_TIME' ? null : randInt(1, 28),
    description: `${f.name} covering community upkeep`,
  }));
  await bulkInsert('fee', feeRows, 'fees');

  // -------------------------------------------------------------------
  // Funds + Projects
  // -------------------------------------------------------------------
  const fundRows = [];
  for (let i = 0; i < FUNDS; i++) {
    fundRows.push({
      id: uuid(),
      communityId: community.id,
      name: `${pick(['Maintenance', 'Security', 'Improvement', 'Emergency Reserve', 'Landscaping', 'Amenities'])} Fund ${i + 1}`,
      description: 'Fund for community projects and reserves',
    });
  }
  await bulkInsert('fund', fundRows, 'funds');

  const projectStatuses = ['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'];
  const projectRows = [];
  for (let i = 0; i < PROJECTS; i++) {
    const status = pick(projectStatuses);
    const start = randDateBetween(daysAgo(700), daysAgo(30));
    projectRows.push({
      id: uuid(),
      communityId: community.id,
      fundId: pick(fundRows).id,
      name: `${pick(PROJECT_NAME_ROOTS)} #${i + 1}`,
      description: 'Community project',
      budget: randDecimal(2000, 80000),
      status,
      startDate: start,
      endDate: status === 'COMPLETED' || status === 'CANCELLED'
        ? randDateBetween(start, daysAgo(1))
        : (status === 'ONGOING' ? daysFromNow(randInt(10, 120)) : null),
    });
  }
  await bulkInsert('project', projectRows, 'projects');

  // -------------------------------------------------------------------
  // Payments — each resident pays a random subset of fees. Some direct
  // fund top-ups and project payments are mixed in too so all three
  // Payment "what this is for" branches (fee/project/fund) get exercised.
  // -------------------------------------------------------------------
  console.log(`Building payments (up to ${MAX_PAYMENTS_PER_RESIDENT} per resident)...`);
  const paymentStatuses = ['VERIFIED', 'VERIFIED', 'VERIFIED', 'PENDING', 'PENDING_REVIEW', 'REJECTED'];
  const paymentRows = [];
  for (const resident of residentRows) {
    const numPayments = randInt(0, MAX_PAYMENTS_PER_RESIDENT);
    for (let p = 0; p < numPayments; p++) {
      const status = pick(paymentStatuses);
      const kind = Math.random();
      let feeId = null, projectId = null, fundId = null, amount;
      if (kind < 0.75) {
        const fee = pick(feeRows);
        feeId = fee.id;
        amount = fee.amount;
      } else if (kind < 0.9) {
        const project = pick(projectRows);
        projectId = project.id;
        amount = randDecimal(50, 2000);
      } else {
        fundId = pick(fundRows).id;
        amount = randDecimal(50, 2000);
      }

      paymentRows.push({
        id: uuid(),
        communityId: community.id,
        residentId: resident.id,
        feeId,
        projectId,
        fundId,
        amount,
        paymentMethod: pick(PAYMENT_METHODS),
        transactionReference: `TXN-${randInt(1000000, 9999999)}`,
        payerName: null,
        status,
        paidAt: randDateBetween(daysAgo(365), daysAgo(0)),
        verifiedBy: status === 'VERIFIED' ? admin.id : null,
        recordedBy: Math.random() < 0.3 ? admin.id : null,
      });
    }
  }
  await bulkInsert('payment', paymentRows, 'payments');

  // -------------------------------------------------------------------
  // Expenses (+ some receipts), append-only style like the real app.
  //
  // The real app (expenseController.createExpense) never lets an expense
  // be recorded past what's actually available: a project-linked expense
  // is capped by BOTH the project's remaining budget and the real,
  // verified cash sitting in the project's fund, and a project-less
  // ("general") expense is capped by the community's overall real cash
  // position (total VERIFIED payments minus total expenses so far). This
  // seed used to generate expense amounts completely independent of any
  // of that, which is exactly how a large seed could produce an
  // impossible, deeply-negative community balance on the dashboard. Track
  // the same running balances here so seeded data can never violate the
  // rule the app itself enforces.
  // -------------------------------------------------------------------
  console.log(`Building up to ${EXPENSES} expenses (capped by real available funds)...`);

  // Running "collected" per fund: direct-to-fund payments + payments made
  // against a project that belongs to that fund (mirrors
  // computeFundMoneyForCommunity in fundController.js, minus the
  // multi-fund-allocation ratio math, since this seed always gives a
  // project exactly one fund).
  const fundCollected = new Map(fundRows.map((f) => [f.id, 0]));
  for (const p of paymentRows) {
    if (p.status !== 'VERIFIED') continue;
    if (p.fundId) {
      fundCollected.set(p.fundId, (fundCollected.get(p.fundId) || 0) + Number(p.amount));
    } else if (p.projectId) {
      const project = projectRows.find((pr) => pr.id === p.projectId);
      if (project) fundCollected.set(project.fundId, (fundCollected.get(project.fundId) || 0) + Number(p.amount));
    }
  }
  const fundSpent = new Map(fundRows.map((f) => [f.id, 0]));
  const projectSpent = new Map(projectRows.map((pr) => [pr.id, 0]));

  // Community-wide real cash position — same formula as
  // dashboardController.getAdminDashboard's netBalance, and the same guard
  // rail createExpense now applies to project-less expenses.
  const totalVerifiedCollected = paymentRows
    .filter((p) => p.status === 'VERIFIED')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  let communityRemaining = totalVerifiedCollected;

  const expenseRows = [];
  const receiptRows = [];
  let attempts = 0;
  // Try up to 3x the target count since some attempts will be skipped
  // (nothing left available to spend), so we still land close to
  // EXPENSES rows without ever spending money that isn't there.
  while (expenseRows.length < EXPENSES && attempts < EXPENSES * 3) {
    attempts++;
    const linkToProject = Math.random() < 0.7 && projectRows.length > 0;
    let projectId = null;
    let amount = randDecimal(50, 6000);

    if (linkToProject) {
      const project = pick(projectRows);
      const remainingBudget = Number(project.budget) - (projectSpent.get(project.id) || 0);
      const fundAvailable = (fundCollected.get(project.fundId) || 0) - (fundSpent.get(project.fundId) || 0);
      const cap = Math.min(remainingBudget, fundAvailable);
      if (cap < 50) continue; // nothing meaningful left on this project/fund — skip and try another
      amount = randDecimal(50, Math.min(6000, cap));
      projectId = project.id;
      projectSpent.set(project.id, (projectSpent.get(project.id) || 0) + amount);
      fundSpent.set(project.fundId, (fundSpent.get(project.fundId) || 0) + amount);
    } else {
      if (communityRemaining < 50) continue; // community has nothing left to spend — skip and try again
      amount = randDecimal(50, Math.min(6000, communityRemaining));
      communityRemaining -= amount;
    }

    const expenseId = uuid();
    expenseRows.push({
      id: expenseId,
      communityId: community.id,
      projectId,
      recordedBy: admin.id,
      category: pick(CATEGORIES),
      description: pick(EXPENSE_DESCRIPTIONS),
      vendor: pick(VENDORS),
      amount,
      spentAt: randDateBetween(daysAgo(500), daysAgo(0)),
    });

    if (Math.random() < 0.5) {
      const receiptCount = randInt(1, 2);
      for (let r = 0; r < receiptCount; r++) {
        receiptRows.push({
          id: uuid(),
          expenseId,
          fileUrl: `/uploads/receipts/receipt-${expenseId}-${r + 1}.pdf`,
        });
      }
    }
  }
  if (expenseRows.length < EXPENSES) {
    console.log(`  (stopped at ${expenseRows.length}/${EXPENSES} expenses — that's all the community's real funds can cover without going into deficit)`);
  }
  await bulkInsert('expense', expenseRows, 'expenses');
  await bulkInsert('receipt', receiptRows, 'receipts');

  // -------------------------------------------------------------------
  // Audit logs — high-volume append-only table, good for pagination /
  // index integrity testing.
  // -------------------------------------------------------------------
  console.log(`Building ${AUDIT_LOGS} audit logs...`);
  const auditRows = [];
  for (let i = 0; i < AUDIT_LOGS; i++) {
    const action = pick(AUDIT_ACTIONS);
    const entityType = pick(AUDIT_ENTITY_TYPES);
    auditRows.push({
      id: uuid(),
      communityId: community.id,
      actorId: admin.id,
      actorName: admin.fullName,
      actorRole: 'ADMIN',
      action,
      entityType,
      entityId: uuid(),
      description: `${action} on ${entityType}`,
      createdAt: randDateBetween(daysAgo(365), daysAgo(0)),
    });
  }
  await bulkInsert('auditLog', auditRows, 'audit logs');

  // -------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------
  const counts = {
    communities: await prisma.community.count(),
    users: await prisma.user.count(),
    residents: await prisma.resident.count(),
    fees: await prisma.fee.count(),
    payments: await prisma.payment.count(),
    funds: await prisma.fund.count(),
    projects: await prisma.project.count(),
    expenses: await prisma.expense.count(),
    receipts: await prisma.receipt.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nSeed complete in ${secs}s:`, counts);
  console.log('Login with any seeded email + password: Password123!');
  console.log('Admin login: admin@greenwood.example / Password123!');
  console.log('Demo resident login: bob@greenwood.example / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
