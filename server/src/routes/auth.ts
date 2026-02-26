import { Router, Request, Response } from 'express';
import { z } from 'zod/v4';
import { supabase } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import { FREE_TIER_DAYS } from '../lib/limits.js';

const router = Router();

const SignupSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

// POST /api/auth/signup
// Create a user account (email/password, auto-confirmed)
router.post('/signup', async (req: Request, res: Response) => {
  const parsed = SignupSchema.safeParse(req.body);
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find(i => i.path.includes('password'));
    const error = passwordIssue
      ? 'Password must be at least 8 characters'
      : 'Invalid request';
    res.status(400).json({ error });
    return;
  }

  const { email, password } = parsed.data;

  // Create user (auto-confirmed)
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    const message = createError.message?.includes('already been registered')
      ? 'An account with this email already exists'
      : createError.message || 'Failed to create account';

    logger.warn({ email, error: createError.message }, 'User creation failed');
    res.status(400).json({ error: message });
    return;
  }

  // Stamp trial_expires_at on every new user
  if (createData.user) {
    const expiresAt = new Date(Date.now() + FREE_TIER_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ trial_expires_at: expiresAt })
      .eq('id', createData.user.id);

    if (updateError) {
      logger.error({ userId: createData.user.id, error: updateError.message }, 'Failed to set trial_expires_at');
    }
  }

  logger.info({ email }, 'User created');
  res.json({ success: true });
});

export default router;
