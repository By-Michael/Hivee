const bcrypt = require('bcryptjs');
const { prisma } = require('./testDb');

let counter = 0;
function unique(label) {
  counter += 1;
  return `${label}-${Date.now()}-${counter}`;
}

/**
 * Creates a Community + an ADMIN User belonging to it, with a known
 * plaintext password (so tests can log in with it).
 */
async function createCommunityWithAdmin({ password = 'Password123!' } = {}) {
  const community = await prisma.community.create({
    data: { name: unique('Test Community') },
  });

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      communityId: community.id,
      fullName: 'Test Admin',
      email: `${unique('admin')}@example.com`,
      passwordHash,
      role: 'ADMIN',
    },
  });

  return { community, admin: { ...admin, plainPassword: password } };
}

module.exports = { createCommunityWithAdmin, unique };
