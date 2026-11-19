import type { Request as ExpressRequest } from 'express';
import type { AuthUser } from '../middlewares/tsoaAuth';

export interface AuthenticatedRequest extends ExpressRequest {
  user?: AuthUser;
}
