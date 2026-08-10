import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import logger from './logger.js';

/**
 * Better Auth configuration.
 *
 * - Sessions are cookie-based (frontend and API are same-site:
 *   dearhermes.com + api.dearhermes.com in production, localhost in dev).
 *   The bearer plugin additionally allows `Authorization: Bearer <token>`
 *   for non-browser clients (native app, scripts).
 * - Password hashing is bcrypt end-to-end so the 110 accounts imported from
 *   Supabase Auth (bcrypt `$2a$` hashes) keep their passwords, and new
 *   accounts use the same scheme.
 * - Google sign-in reuses the pre-existing Google OAuth client, so returning
 *   users see no new consent screen.
 */
export const auth = betterAuth({
  database: pool,
  basePath: '/api/auth',
  baseURL: process.env.SERVER_PUBLIC_URL || `http://localhost:${process.env.PORT || 3003}`,
  trustedOrigins: [process.env.FRONTEND_URL || 'http://localhost:5176'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
    sendResetPassword: async ({ user, url }) => {
      // No SMTP is configured yet. Log the reset link server-side so the
      // operator can relay it manually; wire an email provider here to
      // enable self-serve resets.
      logger.info({ email: user.email, url }, 'Password reset requested (no SMTP configured — relay manually)');
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh expiry at most daily
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  plugins: [bearer()],
});
