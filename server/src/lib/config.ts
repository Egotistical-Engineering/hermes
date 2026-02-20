export const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
);

export function isAdminUser(userId: string): boolean {
  return ADMIN_USER_IDS.has(userId);
}
