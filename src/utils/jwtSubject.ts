/** The `sub` claim for a user id. JWT subjects are strings (RFC 7519, section 4.1.2). */
export const subjectFor = (userId: number): string => String(userId);

const POSITIVE_INTEGER = /^[1-9]\d*$/;

/**
 * The user id in a token's `sub` claim, as issued by `subjectFor`, or null when it
 * isn't a string holding a positive integer.
 */
export const userIdFromSubject = (sub: unknown): number | null => {
  if (typeof sub !== 'string' || !POSITIVE_INTEGER.test(sub)) return null;

  const value = Number(sub);
  return Number.isSafeInteger(value) ? value : null;
};
