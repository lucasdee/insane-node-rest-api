import { Controller, Get, Route, Security, Tags, Request } from '@tsoa/runtime';
import type { Request as ExpressRequest } from 'express';
import { userService } from '../services/user.service.js';
import { UserProfile } from '../dtos/user.dto.js';

interface AuthenticatedRequest extends ExpressRequest {
  user?: { sub: string };
}

@Route('users')
@Tags('Users')
export class UserController extends Controller {
  @Get('me')
  @Security('jwt')
  public async getProfile(@Request() req: AuthenticatedRequest): Promise<UserProfile> {
    const userId = req.user?.sub;
    if (!userId) {
      this.setStatus(401);
      throw new Error('Unauthorized: User ID not found');
    }
    try {
      const user = await userService.getUser(parseInt(userId, 10));
      return { id: user!.id, username: user!.username };
    } catch (err) {
      this.setStatus(401);
      throw new Error(err instanceof Error ? err.message : 'Unauthorized');
    }
  }
}
