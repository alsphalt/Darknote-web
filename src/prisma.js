import { PrismaClient } from '@prisma/client';

// Single PrismaClient for the whole process (routes + sockets + services).
// Creating multiple clients exhausts DB connections and causes flaky behavior.
export const prisma = new PrismaClient();
