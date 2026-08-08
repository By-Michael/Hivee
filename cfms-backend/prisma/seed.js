const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

// ---------------------------------------------------------------------------
// Small helpers (no extra deps needed — pure JS random generators)
// ---------------------------------------------------------------------------
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickSome(arr, min, max) {
  const count = randInt(min, Math.min(max, arr.length));
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
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

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Nancy', 'Matthew', 'Lisa',
  'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Selam', 'Abebe',
  'Kalkidan', 'Bereket', 'Hana', 'Yonas', 'Meron', 'Dawit', 'Ruth', 'Samuel',
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
const PROJECT_NAMES = [
  'Perimeter Wall Repair', 'Playground Renovation', 'Solar Lighting Upgrade',
  'Clubhouse Roof Repair', 'Swimming Pool Resurfacing', 'CCTV Expansion',
  'Garden & Landscaping Overhaul', 'Parking Lot Repaving', 'Water Tank Installation',
  'Community Hall Renovation', 'Gate Automation', 'Drainage System Upgrade',
];
const FEE_NAMES = [
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

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  // -------------------------------------------------------------------
  // Reset (children first, respecting FK order) so the seed is repeatable
  // -------------------------------------------------------------------
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
  // Community
  // -------------------------------------------------------------------
  const community = await prisma.community.create({
    data: {
      name: 'Greenwood Estate',
      address: '123 Greenwood Ave, Addis Ababa',
      contactInfo: 'committee@greenwood.example',
      paymentBankName: 'Commercial Bank of Ethiopia',
      paymentAccountName: 'Greenwood Estate Residents Committee',
      paymentAccountNumber: '1000123456789',
    },
  });

  // -------------------------------------------------------------------
  // Admin (+ a second admin so multi-admin flows can be tested)
  // -------------------------------------------------------------------
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
  // Residents — 30 residents, each with a real user + unit number,
  // spread across all ResidentStatus values.
  // -------------------------------------------------------------------
  const RESIDENT_COUNT = 30;
  const statuses = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'MOVED_OUT']; // weighted mostly ACTIVE
  const usedEmails = new Set();
  const residents = [];

  for (let i = 0; i < RESIDENT_COUNT; i++) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const fullName = `${first} ${last}`;
    let email = `${slugify(first)}.${slugify(last)}@greenwood.example`;
    let n = 1;
    while (usedEmails.has(email)) {
      email = `${slugify(first)}.${slugify(last)}${n++}@greenwood.example`;
    }
    usedEmails.add(email);

    const block = String.fromCharCode(65 + (i % 5)); // A-E
    const unitNumber = `${block}-${String(100 + i)}`;

    const user = await prisma.user.create({
      data: {
        communityId: community.id,
        fullName,
        email,
        passwordHash,
        role: 'RESIDENT',
        resident: {
          create: {
            unitNumber,
            status: pick(statuses),
            joinedAt: randDateBetween(daysAgo(900), daysAgo(10)),
          },
        },
      },
      include: { resident: true },
    });
    residents.push(user.resident);
  }

  // Keep the well-known demo login working (Bob Resident / A-101)
  const demoResident = await prisma.user.create({
    data: {
      communityId: community.id,
      fullName: 'Bob Resident',
      email: 'bob@greenwood.example',
      passwordHash,
      role: 'RESIDENT',
      resident: { create: { unitNumber: 'A-101', status: 'ACTIVE' } },
    },
    include: { resident: true },
  });
  residents.push(demoResident.resident);

  // -------------------------------------------------------------------
  // Fees — every frequency, several fees
  // -------------------------------------------------------------------
  const fees = [];
  for (const f of FEE_NAMES) {
    const fee = await prisma.fee.create({
      data: {
        communityId: community.id,
        name: f.name,
        amount: randDecimal(f.amount[0], f.amount[1]),
        frequency: f.frequency,
        dueDay: f.frequency === 'ONE_TIME' ? null : randInt(1, 28),
        description: `${f.name} covering community upkeep`,
      },
    });
    fees.push(fee);
  }

  // -------------------------------------------------------------------
  // Payments — each resident pays a random subset of fees,
  // covering every PaymentStatus and every PaymentMethod.
  // -------------------------------------------------------------------
  const paymentStatuses = ['VERIFIED', 'VERIFIED', 'VERIFIED', 'PENDING', 'REJECTED']; // weighted
  for (const resident of residents) {
    const theirFees = pickSome(fees, 1, fees.length);
    for (const fee of theirFees) {
      const status = pick(paymentStatuses);
      await prisma.payment.create({
        data: {
          residentId: resident.id,
          feeId: fee.id,
          amount: fee.amount,
          paymentMethod: pick(PAYMENT_METHODS),
          transactionReference: `TXN-${randInt(100000, 999999)}`,
          status,
          paidAt: randDateBetween(daysAgo(180), daysAgo(0)),
          verifiedBy: status === 'VERIFIED' ? admin.id : null,
        },
      });
    }
  }

  // -------------------------------------------------------------------
  // Funds — several, each backing 1-3 projects
  // -------------------------------------------------------------------
  const FUND_DEFS = [
    { name: 'Maintenance Fund', description: 'General upkeep of common areas' },
    { name: 'Security Fund', description: 'Guards, gates, and CCTV' },
    { name: 'Improvement Fund', description: 'Upgrades and new amenities' },
    { name: 'Emergency Reserve Fund', description: 'Unplanned repairs and emergencies' },
  ];
  const funds = [];
  for (const f of FUND_DEFS) {
    const fund = await prisma.fund.create({
      data: { communityId: community.id, name: f.name, description: f.description },
    });
    funds.push(fund);
  }

  // -------------------------------------------------------------------
  // Projects — covering every ProjectStatus, linked to a fund
  // -------------------------------------------------------------------
  const projectStatuses = ['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'];
  const projects = [];
  const usedProjectNames = pickSome(PROJECT_NAMES, 10, PROJECT_NAMES.length);
  for (let i = 0; i < usedProjectNames.length; i++) {
    const status = projectStatuses[i % projectStatuses.length];
    const start = randDateBetween(daysAgo(365), daysAgo(30));
    const project = await prisma.project.create({
      data: {
        communityId: community.id,
        fundId: pick(funds).id,
        name: usedProjectNames[i],
        description: `${usedProjectNames[i]} for the community`,
        budget: randDecimal(2000, 50000),
        status,
        startDate: start,
        endDate: status === 'COMPLETED' || status === 'CANCELLED'
          ? randDateBetween(start, daysAgo(1))
          : (status === 'ONGOING' ? daysFromNow(randInt(10, 90)) : null),
      },
    });
    projects.push(project);
  }

  // -------------------------------------------------------------------
  // Expenses — some tied to a project, some general community expenses,
  // covering every ExpenseCategory. Some get one or more receipts.
  // -------------------------------------------------------------------
  const EXPENSE_COUNT = 40;
  for (let i = 0; i < EXPENSE_COUNT; i++) {
    const linkToProject = Math.random() < 0.7;
    const expense = await prisma.expense.create({
      data: {
        projectId: linkToProject ? pick(projects).id : null,
        recordedBy: admin.id,
        category: pick(CATEGORIES),
        description: pick(EXPENSE_DESCRIPTIONS),
        vendor: pick(VENDORS),
        amount: randDecimal(50, 5000),
        spentAt: randDateBetween(daysAgo(300), daysAgo(0)),
      },
    });

    // ~65% of expenses have a receipt on file
    if (Math.random() < 0.65) {
      const receiptCount = randInt(1, 2);
      for (let r = 0; r < receiptCount; r++) {
        await prisma.receipt.create({
          data: {
            expenseId: expense.id,
            fileUrl: `/uploads/receipts/receipt-${expense.id}-${r + 1}.pdf`,
          },
        });
      }
    }
  }

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
  };

  console.log('Seed complete:', counts);
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
