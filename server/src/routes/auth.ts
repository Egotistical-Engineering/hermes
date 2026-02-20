import { Router, Request, Response } from 'express';
import { z } from 'zod/v4';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
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

const ActivateTrialSchema = z.object({
  trialDays: z.number().int().min(1).max(365),
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

  // Atomically consume an invite code use (v2 returns trial info)
  const { data: trialResult, error: rpcError } = await supabase.rpc('use_invite_code_v2', {
    code_input: inviteCode,
  });

  if (rpcError || trialResult === -1) {
    res.status(403).json({ error: 'Invalid or expired invite code' });
    return;
  }

  const trialDays = trialResult as number; // 0 = standard, >0 = trial days

  // Create user (auto-confirmed)
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
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

  // If trial code, stamp trial_expires_at on the new user's profile
  if (trialDays > 0 && createData.user) {
    const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ trial_expires_at: expiresAt })
      .eq('id', createData.user.id);

    if (updateError) {
      logger.error({ userId: createData.user.id, error: updateError.message }, 'Failed to set trial_expires_at');
    }
  }

  logger.info({ email, trialDays }, 'User created via invite code');
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

  const { data: trialResult, error: rpcError } = await supabase.rpc('use_invite_code_v2', {
    code_input: inviteCode,
  });

  if (rpcError || trialResult === -1) {
    res.status(403).json({ error: 'Invalid or expired invite code' });
    return;
  }

  const trialDays = trialResult as number;
  res.json({ success: true, trialDays });
});

// POST /api/auth/activate-trial
// Activate trial for the current user (Google OAuth flow — called after redirect)
router.post('/activate-trial', requireAuth, async (req: Request, res: Response) => {
  const parsed = ActivateTrialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }

  const userId = req.user!.id;
  const { trialDays } = parsed.data;

  // Idempotent: skip if trial_expires_at is already set
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('trial_expires_at')
    .eq('id', userId)
    .single();

  if (profile?.trial_expires_at) {
    res.json({ success: true, alreadyActive: true });
    return;
  }

  const expiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('user_profiles')
    .update({ trial_expires_at: expiresAt })
    .eq('id', userId);

  if (error) {
    logger.error({ userId, error: error.message }, 'Failed to activate trial');
    res.status(500).json({ error: 'Failed to activate trial' });
    return;
  }

  logger.info({ userId, trialDays }, 'Trial activated');
  res.json({ success: true });
});

export default router;
