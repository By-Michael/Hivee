const bcrypt = require('bcryptjs');
const prisma = require('../src/config/prisma');

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const community = await prisma.community.create({
    data: {
      name: 'Greenwood Estate',
      address: '123 Greenwood Ave',
      contactInfo: 'committee@greenwood.example',
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

  const residentUser = await prisma.user.create({
    data: {
      communityId: community.id,
      fullName: 'Bob Resident',
      email: 'bob@greenwood.example',
      passwordHash,
      role: 'RESIDENT',
      resident: { create: { unitNumber: 'A-101' } },
    },
    include: { resident: true },
  });

  const fee = await prisma.fee.create({
    data: {
      communityId: community.id,
      name: 'Monthly Security Fee',
      amount: 50,
      frequency: 'MONTHLY',
      dueDay: 5,
      description: 'Covers gate security staffing',
    },
  });

  const fund = await prisma.fund.create({
    data: {
      communityId: community.id,
      name: 'Maintenance Fund',
      description: 'General upkeep of common areas',
    },
  });

  console.log('Seeded:', {
    community: community.name,
    adminEmail: admin.email,
    residentEmail: residentUser.email,
    fee: fee.name,
    fund: fund.name,
    password: 'Password123!',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
