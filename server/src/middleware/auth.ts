import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

type JwtUser = { id: string; email?: string };

export function getUserFromBearerToken(token: string): JwtUser | null {
  if (!JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'authenticated',
    }) as jwt.JwtPayload;
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}

export function getOptionalUser(req: Request): JwtUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return getUserFromBearerToken(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = authHeader.slice(7);

  const user = getUserFromBearerToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = user;
  next();
}
