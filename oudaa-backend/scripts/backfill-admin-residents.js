// One-off fix for databases created before this change: any ADMIN user
// without a Resident row never showed up in the Residents panel, including
// under "Committee only" (see authController.registerCommunity and
// prisma/seed.js for the same fix applied going forward).
//
// Run once with: node scripts/backfill-admin-residents.js
const prisma = require('../src/config/prisma');

async function main() {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', resident: null },
    select: { id: true, fullName: true },
  });

  if (admins.length === 0) {
    console.log('No admins missing a Resident row. Nothing to do.');
    return;
  }

  for (const admin of admins) {
    await prisma.resident.create({
      data: { userId: admin.id, unitNumber: 'N/A', status: 'ACTIVE' },
    });
    console.log(`Created Resident row for ${admin.fullName} (${admin.id})`);
  }

  console.log(`Done — fixed ${admins.length} admin(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
