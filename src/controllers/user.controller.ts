import { Controller, Get, Route, Security, Tags, Request } from '@tsoa/runtime';
import { AuthenticatedRequest } from './types.js';
import { userService } from '../services/user.service.js';
import { User } from '../dtos/user.dto.js';

@Route('users')
@Tags('Users')
export class UserController extends Controller {
  @Get('me')
  @Security('jwt')
  public async getProfile(@Request() req: AuthenticatedRequest): Promise<User> {
    const userId = req.user!.sub;

    const user = await userService.getUser(parseInt(userId, 10));
    if (!user) {
      this.setStatus(404);
      throw new Error('User not found');
    }

    return user;
  }
}
