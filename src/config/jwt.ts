import type { Algorithm } from 'jsonwebtoken';

/**
 * The only algorithm tokens are signed with and the only one accepted when verifying
 * them. Pinning it means a token can't choose how it is checked (e.g. `alg: none`), and
 * a change in jsonwebtoken's defaults can't widen what is accepted.
 */
export const JWT_ALGORITHM: Algorithm = 'HS256';
