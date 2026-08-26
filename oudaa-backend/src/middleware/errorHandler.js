const { Prisma } = require('@prisma/client');
const AppError = require('../utils/AppError');

function mapPrismaError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return new AppError(
          `A record with this ${err.meta?.target?.join(', ') || 'value'} already exists`,
          409
        );
      case 'P2025':
        return new AppError('Record not found', 404);
      case 'P2003':
        return new AppError('Related record not found (invalid foreign key)', 400);
      default:
        return new AppError('Database error', 400);
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError('Invalid data provided to database query', 400);
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  let error = err;

  const prismaMapped = mapPrismaError(err);
  if (prismaMapped) error = prismaMapped;

  if (!error.statusCode) {
    error = new AppError(error.message || 'Internal server error', 500);
  }

  // Always log server-side, regardless of env or status code. This used to
  // only log 500s in non-production, which meant Render (NODE_ENV=production)
  // never logged ANY error server-side — including the original Prisma error
  // getting mapped to a generic 400 message, making prod issues undebuggable
  // from the logs. Client response still stays generic/no-stack in prod.
  console.error(`[${req.method} ${req.originalUrl}]`, err);

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    details: error.details,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
  });
};
