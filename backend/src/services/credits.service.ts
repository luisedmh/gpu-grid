import { config } from '../config.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CreditMovementType } from '../generated/prisma/enums.js';
import { HttpError, NotFoundError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { creditEvents } from '../realtime/credit-events.js';

/** The database, inside an open transaction: everything done through it commits together. */
type TransactionClient = Prisma.TransactionClient;

/**
 * Credits are the platform's money. How they move:
 *
 * 1. Submitting a job RESERVEs the most it can cost (its time limit × price),
 *    so a client can never spend credits they do not have.
 * 2. When the job finishes, it is "settled": the client gets a REFUND of what
 *    it did not use, and the provider whose machine ran it gets an EARNING.
 *    Jobs that never ran (compilation errors, lost machines) cost nothing.
 *
 * Every change of a balance is also written as a CreditMovement, in the same
 * database transaction, so the balance always equals the sum of the movements.
 */

/** The most a job can cost: its whole time limit on the GPU. */
export function maxJobCost(timeoutSeconds: number): number {
  return timeoutSeconds * config.creditsPerGpuSecond;
}

/** What some GPU time costs. Seconds are rounded up, with at least one second. */
export function gpuTimeCost(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / 1000)) * config.creditsPerGpuSecond;
}

/** The provider's part of a cost. The platform keeps the rest as its commission. */
export function providerShare(cost: number): number {
  return Math.floor((cost * config.providerSharePercent) / 100);
}

/** Changes a balance and records why, inside an open transaction. */
async function move(
  tx: TransactionClient,
  userId: string,
  type: CreditMovementType,
  amount: number,
  jobId?: string,
) {
  await tx.user.update({ where: { id: userId }, data: { balance: { increment: amount } } });
  await tx.creditMovement.create({ data: { userId, type, amount, jobId } });
}

/**
 * Holds the most a new job can cost. Throws 402 Payment Required if the
 * client does not have enough, which also undoes the job's creation.
 */
export async function reserveForJob(
  tx: TransactionClient,
  clientId: string,
  jobId: string,
  amount: number,
) {
  // Take the credits only if there are enough: checking and taking in one
  // statement means two jobs submitted at once cannot both use the same credits
  const taken = await tx.user.updateMany({
    where: { id: clientId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
  if (taken.count === 0) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: clientId },
      select: { balance: true },
    });
    throw new HttpError(
      402,
      `Not enough credits: this job reserves up to ${amount} and you have ${user.balance}.`,
    );
  }
  await tx.creditMovement.create({
    data: { userId: clientId, type: 'RESERVE', amount: -amount, jobId },
  });
}

/**
 * Settles a finished job: charges `cost` (never more than was reserved),
 * refunds the rest to the client and pays the provider's share.
 * Must be called once, in the same transaction that finishes the job.
 * Returns the users whose balance changed, to notify them afterwards.
 */
export async function settleJob(
  tx: TransactionClient,
  jobId: string,
  cost: number,
): Promise<string[]> {
  const job = await tx.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { clientId: true, reservedCredits: true, machine: { select: { ownerId: true } } },
  });
  const charged = Math.min(Math.max(cost, 0), job.reservedCredits);
  const changed: string[] = [];

  const refund = job.reservedCredits - charged;
  // (Verification jobs have no client and reserve nothing)
  if (refund > 0 && job.clientId) {
    await move(tx, job.clientId, 'REFUND', refund, jobId);
    changed.push(job.clientId);
  }

  const earning = job.machine ? providerShare(charged) : 0;
  if (job.machine && earning > 0) {
    await move(tx, job.machine.ownerId, 'EARNING', earning, jobId);
    changed.push(job.machine.ownerId);
  }

  await tx.job.update({ where: { id: jobId }, data: { costCredits: charged } });
  return changed;
}

/** Adds credits to an account: free credits for new clients, or given by an admin. */
export async function grantCredits(userId: string, amount: number, type: 'WELCOME' | 'GRANT') {
  await prisma.$transaction((tx) => move(tx, userId, type, amount));
  creditEvents.notify(userId);
}

/** A user's balance and their latest movements, newest first. */
export async function getStatement(userId: string, limit = 50) {
  const [user, movements] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
    prisma.creditMovement.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        amount: true,
        createdAt: true,
        job: { select: { id: true, name: true } },
      },
    }),
  ]);
  if (!user) throw new NotFoundError('User not found');

  return {
    balance: user.balance,
    creditsPerGpuSecond: config.creditsPerGpuSecond,
    providerSharePercent: config.providerSharePercent,
    movements,
  };
}
