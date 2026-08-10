import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth.js';

type SessionUser = { id: string; email?: string };

async function getSessionUser(req: Request): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session?.user) return null;
    return { id: session.user.id, email: session.user.email ?? undefined };
  } catch {
    return null;
  }
}

export async function getOptionalUser(req: Request): Promise<SessionUser | null> {
  return getSessionUser(req);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.user = user;
  next();
}
