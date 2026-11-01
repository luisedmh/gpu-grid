import { EventEmitter } from 'node:events';
import { prisma } from '../lib/prisma.js';

/**
 * Announces that some users' balances changed, so their browsers can update.
 * Only the user ids travel here: the new balance is read from the database.
 */
class CreditEvents extends EventEmitter<{ 'credits-updated': [string, number] }> {
  /** Reads each user's current balance and announces it. Never throws. */
  notify(...userIds: string[]): void {
    if (this.listenerCount('credits-updated') === 0 || userIds.length === 0) return;
    prisma.user
      .findMany({ where: { id: { in: userIds } }, select: { id: true, balance: true } })
      .then((users) => users.forEach((user) => this.emit('credits-updated', user.id, user.balance)))
      .catch((err) => console.error('Could not announce balance changes:', err));
  }
}

export const creditEvents = new CreditEvents();
