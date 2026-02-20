import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { ADMIN_USER_IDS } from '../lib/config.js';

const router = Router();

const FREE_DAILY_LIMIT = 10;
const PRO_MONTHLY_LIMIT = 300;

router.get('/current', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan, subscription_status, billing_cycle_anchor, cancel_at_period_end, current_period_end')
    .eq('id', userId)
    .single();

  if (!profile) {
    res.json({
      plan: 'free',
      used: 0,
      limit: FREE_DAILY_LIMIT,
      remaining: FREE_DAILY_LIMIT,
      resetInfo: 'Resets daily at midnight UTC',
      subscriptionStatus: 'none',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      hasMcpAccess: ADMIN_USER_IDS.has(userId),
    });
    return;
  }

  const isPro = profile.plan === 'pro' &&
    ['active', 'trialing', 'past_due'].includes(profile.subscription_status);

  let used: number;
  let limit: number;
  let resetInfo: string;

  if (isPro) {
    const periodStart = profile.billing_cycle_anchor || new Date().toISOString();
    const { data } = await supabase.rpc('count_period_messages', {
      p_user_id: userId,
      p_period_start: periodStart,
    });
    used = data ?? 0;
    limit = PRO_MONTHLY_LIMIT;
    resetInfo = profile.current_period_end
      ? `Resets on ${new Date(profile.current_period_end).toLocaleDateString()}`
      : 'Resets at next billing cycle';
  } else {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.rpc('count_daily_messages', {
      p_user_id: userId,
      p_date: today,
    });
    used = data ?? 0;
    limit = FREE_DAILY_LIMIT;
    resetInfo = 'Resets daily at midnight UTC';
  }

  const isAdmin = ADMIN_USER_IDS.has(userId);

  res.json({
    plan: profile.plan,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetInfo,
    subscriptionStatus: profile.subscription_status,
    cancelAtPeriodEnd: profile.cancel_at_period_end,
    currentPeriodEnd: profile.current_period_end,
    hasMcpAccess: isPro || isAdmin,
  });
});

export default router;
