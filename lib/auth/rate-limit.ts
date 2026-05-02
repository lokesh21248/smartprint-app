const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(userId: string, limit: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const userRecord = rateLimitMap.get(userId);

  if (!userRecord || now > userRecord.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (userRecord.count >= limit) {
    return true;
  }

  userRecord.count += 1;
  return false;
}
