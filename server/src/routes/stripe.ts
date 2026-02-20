import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Guard middleware: reject requests when Stripe is not configured
function requireStripe(_req: Request, res: Response, next: () => void) {
  if (!stripe) {
    logger.warn('Stripe request rejected — STRIPE_SECRET_KEY not configured');
    res.status(503).json({ error: 'Billing is not configured' });
    return;
  }
  next();
}

router.use(requireStripe);

// --- Helpers ---

async function findUserByStripeCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id ?? null;
}

/**
 * In Stripe's clover API, `current_period_end` was removed from Subscription.
 * Use `next_pending_invoice_item_invoice` as the closest replacement,
 * falling back to billing_cycle_anchor + 1 month.
 */
function getSubscriptionPeriodEnd(sub: Stripe.Subscription): string {
  if (sub.next_pending_invoice_item_invoice) {
    return new Date(sub.next_pending_invoice_item_invoice * 1000).toISOString();
  }
  // Fallback: anchor + 1 month
  const anchor = new Date(sub.billing_cycle_anchor * 1000);
  anchor.setMonth(anchor.getMonth() + 1);
  return anchor.toISOString();
}

function getSubscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

// --- Webhook ---

router.post('/webhook', async (req: Request, res: Response) => {
  if (!webhookSecret) {
    logger.warn('Stripe webhook rejected — STRIPE_WEBHOOK_SECRET not configured');
    res.status(503).json({ error: 'Webhook signing secret not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe!.webhooks.constructEvent(req.body, sig, webhookSecret!);
  } catch (err: any) {
    logger.warn({ error: err?.message }, 'Stripe webhook signature verification failed');
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  // Atomic idempotency: INSERT ... ON CONFLICT to avoid race conditions
  const { error: insertError } = await supabase
    .from('processed_stripe_events')
    .insert({ event_id: event.id, event_type: event.type });

  if (insertError) {
    // Postgres unique violation (23505) = duplicate event
    if (insertError.code === '23505') {
      res.json({ received: true, duplicate: true });
      return;
    }
    logger.error({ error: insertError.message, eventId: event.id }, 'Failed to record Stripe event');
    res.status(500).json({ error: 'Failed to process webhook' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription || !session.customer) break;

        const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        const userId = session.client_reference_id;

        if (!userId) {
          logger.warn({ customerId }, 'checkout.session.completed missing client_reference_id');
          break;
        }

        const sub = await stripe!.subscriptions.retrieve(subscriptionId);

        await supabase
          .from('user_profiles')
          .update({
            plan: 'pro',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: sub.status,
            billing_cycle_anchor: new Date(sub.billing_cycle_anchor * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: getSubscriptionPeriodEnd(sub),
          })
          .eq('id', userId);

        logger.info({ userId, subscriptionId }, 'User upgraded to Pro via checkout');
        break;
      }

      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await findUserByStripeCustomer(customerId);
        if (!userId) break;

        await supabase
          .from('user_profiles')
          .update({
            plan: 'pro',
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            billing_cycle_anchor: new Date(sub.billing_cycle_anchor * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: getSubscriptionPeriodEnd(sub),
          })
          .eq('id', userId);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await findUserByStripeCustomer(customerId);
        if (!userId) break;

        await supabase
          .from('user_profiles')
          .update({
            subscription_status: sub.status,
            cancel_at_period_end: sub.cancel_at_period_end,
            current_period_end: getSubscriptionPeriodEnd(sub),
          })
          .eq('id', userId);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await findUserByStripeCustomer(customerId);
        if (!userId) break;

        await supabase
          .from('user_profiles')
          .update({
            plan: 'free',
            subscription_status: 'canceled',
            cancel_at_period_end: false,
          })
          .eq('id', userId);

        logger.info({ userId }, 'User subscription canceled — downgraded to free');
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.customer) break;

        const subscriptionId = getSubscriptionIdFromInvoice(invoice);
        if (!subscriptionId) break;

        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
        const userId = await findUserByStripeCustomer(customerId);
        if (!userId) break;

        const sub = await stripe!.subscriptions.retrieve(subscriptionId);

        await supabase
          .from('user_profiles')
          .update({
            plan: 'pro',
            subscription_status: 'active',
            billing_cycle_anchor: new Date(sub.billing_cycle_anchor * 1000).toISOString(),
            current_period_end: getSubscriptionPeriodEnd(sub),
          })
          .eq('id', userId);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.customer) break;

        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
        const userId = await findUserByStripeCustomer(customerId);
        if (!userId) break;

        await supabase
          .from('user_profiles')
          .update({ subscription_status: 'past_due' })
          .eq('id', userId);

        logger.warn({ userId }, 'Payment failed — set to past_due');
        break;
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error({ error: err?.message, eventId: event.id }, 'Webhook processing failed');
    // Delete the idempotency record so it can be retried
    await supabase.from('processed_stripe_events').delete().eq('event_id', event.id);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// --- Customer Portal ---

router.post('/portal', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) {
    res.status(400).json({ error: 'No billing account found' });
    return;
  }

  try {
    const portalSession = await stripe!.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:5176'}`,
    });

    res.json({ url: portalSession.url });
  } catch (err: any) {
    logger.error({ error: err?.message, userId }, 'Failed to create portal session');
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

export default router;
