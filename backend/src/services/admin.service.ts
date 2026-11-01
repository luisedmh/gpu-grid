import type { AgentSummary } from '../agents/scheduler.js';
import { JobStatus } from '../generated/prisma/enums.js';
import { HttpError, NotFoundError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import type { AdminJobsQuery } from '../schemas/admin.schema.js';
import { grantCredits } from './credits.service.js';

/**
 * Everything the administrator sees about the whole platform.
 * The routes that call these functions only let administrators in.
 */

/** Figures for the overview: users, machines, jobs and the money. */
export async function getOverview(live: AgentSummary[]) {
  const [users, machines, statusGroups, balances, charged, earned] = await Promise.all([
    prisma.user.count(),
    prisma.machine.count(),
    prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.user.aggregate({ _sum: { balance: true } }),
    prisma.job.aggregate({ _sum: { costCredits: true } }),
    prisma.creditMovement.aggregate({ where: { type: 'EARNING' }, _sum: { amount: true } }),
  ]);

  const jobs = Object.fromEntries(Object.values(JobStatus).map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >;
  for (const group of statusGroups) jobs[group.status] = group._count._all;

  const paidByClients = charged._sum.costCredits ?? 0;
  const paidToProviders = earned._sum.amount ?? 0;
  return {
    users,
    machines: {
      registered: machines,
      online: live.length,
      busy: live.filter((a) => a.busy).length,
    },
    jobs,
    credits: {
      /** Credits users hold right now */
      inAccounts: balances._sum.balance ?? 0,
      paidByClients,
      paidToProviders,
      /** The platform's commission: what clients paid minus what providers earned */
      platformRevenue: paidByClients - paidToProviders,
    },
  };
}

/** Every account, newest first, with how much they use the platform. */
export function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      balance: true,
      createdAt: true,
      _count: { select: { jobs: true, machines: true } },
    },
  });
}

/** Adds credits to any account. Returns the new balance. */
export async function giveCredits(userId: string, amount: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new NotFoundError('User not found');
  await grantCredits(userId, amount, 'GRANT');
  const { balance } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { balance: true },
  });
  return { balance };
}

/** Makes an account an administrator, or not. Nobody can remove their own admin rights. */
export async function setAdmin(userId: string, isAdmin: boolean, actingAdminId: string) {
  if (userId === actingAdminId && !isAdmin) {
    throw new HttpError(400, 'You cannot remove your own administrator rights');
  }
  const { count } = await prisma.user.updateMany({ where: { id: userId }, data: { isAdmin } });
  if (count === 0) throw new NotFoundError('User not found');
}

/** Every machine on the platform, with its owner and live state. */
export async function listAllMachines(live: AgentSummary[]) {
  const machines = await prisma.machine.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      createdAt: true,
      lastSeenAt: true,
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { jobs: true } },
    },
  });
  const liveById = new Map(live.map((agent) => [agent.machineId, agent]));
  return machines.map((machine) => {
    const agent = liveById.get(machine.id);
    return {
      ...machine,
      online: agent !== undefined,
      busy: agent?.busy ?? false,
      gpus: agent?.gpus ?? [],
      currentJobId: agent?.currentJobId ?? null,
    };
  });
}

/** Removes any machine (e.g. one misbehaving). */
export async function removeMachine(id: string) {
  const { count } = await prisma.machine.deleteMany({ where: { id } });
  if (count === 0) throw new NotFoundError('Machine not found');
}

/** Jobs of every user, newest first, with who submitted them and where they ran. */
export function listAllJobs({ status, limit }: AdminJobsQuery) {
  return prisma.job.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      status: true,
      durationMs: true,
      costCredits: true,
      attempts: true,
      createdAt: true,
      client: { select: { id: true, name: true } },
      machine: { select: { id: true, name: true } },
    },
  });
}
