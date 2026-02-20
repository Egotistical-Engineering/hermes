import { Router, Request, Response } from 'express';
import { z } from 'zod/v4';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import logger from '../lib/logger.js';

const router = Router();

const useInviteLimit = rateLimit({
  windowMs: 60_000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

const ValidateInviteSchema = z.object({
  inviteCode: z.string().trim().min(1),
});

const SignupSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  inviteCode: z.string().trim().min(1),
});

const UseInviteSchema = z.object({
  inviteCode: z.string().trim().min(1),
});

// POST /api/auth/validate-invite
// Check if an invite code is valid (does NOT increment usage)
router.post('/validate-invite', async (req: Request, res: Response) => {
  const parsed = ValidateInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { inviteCode } = parsed.data;

  const { data, error } = await supabase
    .from('invite_codes')
    .select('current_uses, max_uses')
    .eq('code', inviteCode)
    .single();

  if (error || !data || data.current_uses >= data.max_uses) {
    res.status(403).json({ error: 'Invalid or expired invite code' });
    return;
  }

  res.json({ valid: true });
});

// POST /api/auth/signup
// Create a user account with invite code validation (email/password flow)
router.post('/signup', async (req: Request, res: Response) => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid request',
      ...(process.env.NODE_ENV !== 'production' && { details: parsed.error.issues }),
    });
    return;
  }

  const { email, password, inviteCode } = parsed.data;

  // Atomically consume an invite code use
  const { data: codeValid, error: rpcError } = await supabase.rpc('use_invite_code', {
    code_input: inviteCode,
  });

  if (rpcError || !codeValid) {
    res.status(403).json({ error: 'Invalid or expired invite code' });
    return;
  }

  // Create user (auto-confirmed)
  const { error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    // Roll back the invite code usage
    const { error: rollbackError } = await supabase.rpc('rollback_invite_code', { code_input: inviteCode });
    if (rollbackError) {
      logger.error({ inviteCode, error: rollbackError.message }, 'Failed to rollback invite code usage');
    }

    const message = createError.message?.includes('already been registered')
      ? 'An account with this email already exists'
      : 'Failed to create account';

    logger.warn({ email, error: createError.message }, 'User creation failed, rolled back invite code');
    res.status(400).json({ error: message });
    return;
  }

  logger.info({ email }, 'User created via invite code');
  res.json({ success: true });
});

// POST /api/auth/use-invite
// Consume an invite code use (for Google OAuth flow — called before redirect)
router.post('/use-invite', useInviteLimit, async (req: Request, res: Response) => {
  const parsed = UseInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const { inviteCode } = parsed.data;

  const { data: codeValid, error: rpcError } = await supabase.rpc('use_invite_code', {
    code_input: inviteCode,
  });

  if (rpcError || !codeValid) {
    res.status(403).json({ error: 'Invalid or expired invite code' });
    return;
  }

  res.json({ success: true });
});

export default router;
