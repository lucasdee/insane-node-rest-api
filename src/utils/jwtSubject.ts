/** The `sub` claim for a user id. JWT subjects are strings (RFC 7519, section 4.1.2). */
export const subjectFor = (userId: number): string => String(userId);

const POSITIVE_INTEGER = /^[1-9]\d*$/;

/**
 * The user id in a token's `sub` claim, or null when it isn't a positive integer.
 *
 * Tokens are issued with a string `sub`. Tokens issued before that carry a number and
 * are accepted too, so that nobody is logged out by the change. Once they have all
 * expired (the refresh token lifetime after deploying it), the number case can go.
 */
export const userIdFromSubject = (sub: unknown): number | null => {
  let value = NaN;
  if (typeof sub === 'string' && POSITIVE_INTEGER.test(sub)) value = Number(sub);
  else if (typeof sub === 'number') value = sub;

  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
