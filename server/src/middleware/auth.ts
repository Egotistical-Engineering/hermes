import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

type JwtUser = { id: string; email?: string };

// Lazy-initialized JWKS client — caches keys automatically
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
    jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

export async function getUserFromBearerToken(token: string): Promise<JwtUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: 'authenticated',
    });
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email as string | undefined };
  } catch {
    return null;
  }
}

export async function getOptionalUser(req: Request): Promise<JwtUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return getUserFromBearerToken(token);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const token = authHeader.slice(7);
  const user = await getUserFromBearerToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = user;
  next();
}
