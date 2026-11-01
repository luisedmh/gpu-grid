import 'dotenv/config';
import { prisma } from '../lib/prisma.js';

/**
 * Makes an existing account an administrator. Admins cannot sign up from the
 * web on purpose: only someone with access to the server can create one.
 *
 * Usage: npm run make-admin -- someone@example.com
 */
const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error('Usage: npm run make-admin -- <email of an existing account>');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No account with email ${email}. Register it first from the web.`);
  process.exit(1);
}

await prisma.user.update({ where: { email }, data: { isAdmin: true } });
console.log(`${user.name} <${email}> is now an administrator. Log in again to apply it.`);
await prisma.$disconnect();
