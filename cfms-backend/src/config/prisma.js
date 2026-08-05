const { PrismaClient } = require('@prisma/client');

// Reuse a single PrismaClient instance (avoids exhausting DB connections
// with hot-reload in dev, and is the recommended pattern for serverless too).
const prisma = global.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
