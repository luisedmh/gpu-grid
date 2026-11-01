import type { AgentSummary } from '../agents/scheduler.js';
import type { SessionUser } from '../auth/session.js';
import { NotFoundError } from '../lib/http-error.js';
import { generateMachineToken } from '../lib/machine-token.js';
import { prisma } from '../lib/prisma.js';

const machineFields = {
  id: true,
  name: true,
  tokenPrefix: true,
  createdAt: true,
  lastSeenAt: true,
  owner: { select: { id: true, name: true, email: true } },
} as const;

/** Admins see every machine; providers only their own. */
function visibleTo(viewer: SessionUser) {
  return viewer.role === 'ADMIN' ? {} : { ownerId: viewer.id };
}

/**
 * Registers a machine and returns its token. The token is shown this one time:
 * only its hash is stored, so not even the platform can show it again.
 */
export async function createMachine(name: string, ownerId: string) {
  const { token, hash, prefix } = generateMachineToken();
  const machine = await prisma.machine.create({
    data: { name, ownerId, tokenHash: hash, tokenPrefix: prefix },
    select: machineFields,
  });
  return { machine, token };
}

/** The viewer's machines, each combined with its live state if it is connected. */
export async function listMachines(viewer: SessionUser, live: AgentSummary[]) {
  const machines = await prisma.machine.findMany({
    where: visibleTo(viewer),
    orderBy: { createdAt: 'asc' },
    select: machineFields,
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
      connectedAt: agent?.connectedAt ?? null,
    };
  });
}

/** Deletes a machine of the viewer (or any, for admins). */
export async function deleteMachine(id: string, viewer: SessionUser) {
  const { count } = await prisma.machine.deleteMany({ where: { id, ...visibleTo(viewer) } });
  if (count === 0) throw new NotFoundError('Machine not found');
}
