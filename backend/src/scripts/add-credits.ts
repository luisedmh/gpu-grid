import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { grantCredits } from '../services/credits.service.js';

/**
 * Adds credits to an account. There are no real payments yet, so this is how
 * an administrator tops up a balance.
 *
 * Usage: npm run add-credits -- someone@example.com 500
 */
const email = process.argv[2]?.trim().toLowerCase();
const amount = Number(process.argv[3]);

if (!email || !Number.isInteger(amount) || amount <= 0) {
  console.error('Usage: npm run add-credits -- <email> <positive whole number of credits>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No account with email ${email}.`);
  process.exit(1);
}

await grantCredits(user.id, amount, 'GRANT');
const { balance } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
console.log(`Added ${amount} credits to ${user.name} <${email}>. Balance: ${balance}.`);
await prisma.$disconnect();
