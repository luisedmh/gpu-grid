import type { SessionUser } from '../auth/session.js';

// Adds `req.user` to Express requests, filled in by the authentication middleware
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export {};
