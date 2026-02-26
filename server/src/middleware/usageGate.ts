import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import logger from '../lib/logger.js';
import { FREE_DAILY_LIMIT, FREE_TIER_DAYS, PRO_MONTHLY_LIMIT } from '../lib/limits.js';

export async function checkMessageLimit(req: Request, res: Response, next: NextFunction) {
  const userId = req.user!.id;

  try {
    // Fetch user profile
    let { data: profile } = await supabase
      .from('user_profiles')
      .select('plan, subscription_status, billing_cycle_anchor, cancel_at_period_end, current_period_end, trial_expires_at, created_at')
      .eq('id', userId)
      .single();

    // Auto-create profile if missing (stamp trial_expires_at for new users)
    if (!profile) {
      const defaultExpiry = new Date(Date.now() + FREE_TIER_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('user_profiles').insert({ id: userId, trial_expires_at: defaultExpiry });
      profile = {
        plan: 'free' as const,
        subscription_status: 'none',
        billing_cycle_anchor: null,
        cancel_at_period_end: false,
        current_period_end: null,
        trial_expires_at: defaultExpiry,
        created_at: new Date().toISOString(),
      };
    }

    const isPro = profile.plan === 'pro' &&
      ['active', 'trialing', 'past_due'].includes(profile.subscription_status);

    const trialExpiresAt = profile.trial_expires_at;

    let used: number;
    let limit: number;

    if (isPro) {
      // Pro: count messages since billing cycle anchor (or current period start)
      const periodStart = profile.billing_cycle_anchor || profile.current_period_end
        ? new Date(new Date(profile.current_period_end!).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
        : new Date().toISOString();

      const { data } = await supabase.rpc('count_period_messages', {
        p_user_id: userId,
        p_period_start: profile.billing_cycle_anchor || periodStart,
      });
      used = data ?? 0;
      limit = PRO_MONTHLY_LIMIT;
    } else {
      // Free tier: 10 messages/day, time-limited by trial_expires_at (or created_at + FREE_TIER_DAYS fallback)
      const expiryDate = trialExpiresAt
        ? new Date(trialExpiresAt)
        : new Date(new Date(profile.created_at).getTime() + FREE_TIER_DAYS * 24 * 60 * 60 * 1000);

      if (new Date() > expiryDate) {
        res.status(429).json({
          error: 'Message limit reached',
          code: 'FREE_EXPIRED',
          message: 'Your 7-day free trial has ended. Upgrade to Pro to continue using Hermes.',
          plan: profile.plan,
          used: FREE_DAILY_LIMIT,
          limit: FREE_DAILY_LIMIT,
          isTrial: false,
          trialExpiresAt: trialExpiresAt ?? null,
        });
        return;
      }

      // Count messages today (UTC)
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase.rpc('count_daily_messages', {
        p_user_id: userId,
        p_date: today,
      });
      used = data ?? 0;
      limit = FREE_DAILY_LIMIT;
    }

    if (used >= limit) {
      const code = isPro ? 'MONTHLY_LIMIT_EXCEEDED' : 'DAILY_LIMIT_EXCEEDED';

      res.status(429).json({
        error: 'Message limit reached',
        code,
        message: isPro
          ? `You've used all ${limit} messages for this billing period.`
          : `You've used all ${limit} messages for today. Upgrade to Pro for 300/month.`,
        plan: profile.plan,
        used,
        limit,
        isTrial: false,
        trialExpiresAt: trialExpiresAt ?? null,
      });
      return;
    }

    // Attach usage info for downstream use
    req.usageInfo = {
      plan: profile.plan as 'free' | 'pro',
      used,
      limit,
      remaining: limit - used,
      subscriptionStatus: profile.subscription_status,
      cancelAtPeriodEnd: profile.cancel_at_period_end,
      currentPeriodEnd: profile.current_period_end,
      isTrial: false,
      trialExpiresAt: trialExpiresAt ?? null,
    };

    next();
  } catch (err: any) {
    logger.error({ error: err?.message, userId }, 'Usage gate check failed');
    res.status(503).json({ error: 'Unable to verify usage limits. Please try again.' });
  }
}
