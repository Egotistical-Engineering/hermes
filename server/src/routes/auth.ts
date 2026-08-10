import { Router, Request, Response } from 'express';
import { z } from 'zod/v4';
import { supabase } from '../lib/supabase.js';
import logger from '../lib/logger.js';

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
  const { error: createError } = await supabase.auth.admin.createUser({
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

  logger.info({ email }, 'User created');
  res.json({ success: true });
});

export default router;
