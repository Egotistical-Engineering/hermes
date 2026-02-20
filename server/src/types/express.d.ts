declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
      usageInfo?: {
        plan: 'free' | 'pro';
        used: number;
        limit: number;
        remaining: number;
        subscriptionStatus: string;
        cancelAtPeriodEnd: boolean;
        currentPeriodEnd: string | null;
        isTrial: boolean;
        trialExpiresAt: string | null;
      };
    }
  }
}

export {};
