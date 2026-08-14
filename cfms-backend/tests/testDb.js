const prisma = require('../src/config/prisma');

// Every app table, in no particular order — TRUNCATE ... CASCADE handles
// foreign key ordering for us. Keep this in sync with prisma/schema.prisma
// @@map(...) names if you add new tables.
const TABLES = [
  'communities',
  'users',
  'audit_logs',
  'refresh_tokens',
  'residents',
  'fees',
  'payments',
  'funds',
  'projects',
  'expenses',
  'receipts',
  'committee_transfer_requests',
  'committee_transfer_approvals',
  'pending_changes',
  'pending_change_approvals',
];

/**
 * Wipes every app table. Call this in beforeEach (or afterEach) so tests
 * don't see leftover data from a previous test.
 */
async function resetDb() {
  const quoted = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`);
}

async function disconnectDb() {
  await prisma.$disconnect();
}

module.exports = { prisma, resetDb, disconnectDb };
