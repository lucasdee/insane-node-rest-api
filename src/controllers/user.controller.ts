import { Controller, Get, Route, Security, Tags, Request, Response } from '@tsoa/runtime';
import { AuthenticatedRequest } from './types';
import { userService } from '../services/user.service';
import { User } from '../dtos/user.dto';
import { NotFoundError } from '../errors';

@Route('users')
@Tags('Users')
export class UserController extends Controller {
  @Get('me')
  @Security('jwt')
  @Response(404, 'User not found')
  public async getProfile(@Request() req: AuthenticatedRequest): Promise<User> {
    const userId = req.user!.sub;

    const user = await userService.getUser(parseInt(userId, 10));
    if (!user) throw new NotFoundError('User not found');

    return user;
  }
}
