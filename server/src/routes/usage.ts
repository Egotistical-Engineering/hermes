import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { ADMIN_USER_IDS } from '../lib/config.js';
import { FREE_DAILY_LIMIT, PRO_MONTHLY_LIMIT, TRIAL_MONTHLY_LIMIT } from '../lib/limits.js';

const router = Router();

router.get('/current', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('plan, subscription_status, billing_cycle_anchor, cancel_at_period_end, current_period_end, trial_expires_at')
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
      isTrial: false,
      trialExpiresAt: null,
    });
    return;
  }

  const isPro = profile.plan === 'pro' &&
    ['active', 'trialing', 'past_due'].includes(profile.subscription_status);

  const trialExpiresAt = profile.trial_expires_at;
  const isActiveTrial = !isPro && trialExpiresAt != null && new Date(trialExpiresAt) > new Date();

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
  } else if (isActiveTrial) {
    const trialStart = new Date(new Date(trialExpiresAt!).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.rpc('count_period_messages', {
      p_user_id: userId,
      p_period_start: trialStart,
    });
    used = data ?? 0;
    limit = TRIAL_MONTHLY_LIMIT;
    resetInfo = `Trial expires ${new Date(trialExpiresAt!).toLocaleDateString()}`;
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
    isTrial: isActiveTrial,
    trialExpiresAt: trialExpiresAt ?? null,
  });
});

export default router;
