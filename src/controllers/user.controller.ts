import {
  Controller,
  Get,
  Route,
  Security,
  Tags,
  Request,
  Response,
  QueryParam,
} from '@tsoa/runtime';
import { AuthenticatedRequest } from './types';
import { userService } from '../services/user.service';
import { User, UserSummary } from '../dtos/user.dto';
import { NotFoundError } from '../errors';

@Route('users')
@Tags('Users')
export class UserController extends Controller {
  /**
   * Lists other users, ordered by username, for example to pick whom to assign a memo to.
   * Only uuid, username and display name are returned. You are never in the list.
   * @param search Only users whose username or display name contains this, ignoring case.
   * @minLength search 1 Please provide at least 1 character to search for
   * @maxLength search 64 Please provide at most 64 characters to search for
   * @param limit How many users to return, 20 by default.
   * @isInt limit Please provide a whole number
   * @minimum limit 1 Please provide a limit of at least 1
   * @maximum limit 50 Please provide a limit of at most 50
   * @param offset How many users to skip, for paging.
   * @isInt offset Please provide a whole number
   * @minimum offset 0 Please provide an offset of at least 0
   */
  @Get('')
  @Security('jwt')
  public async searchUsers(
    @Request() req: AuthenticatedRequest,
    @QueryParam() search?: string,
    @QueryParam() limit?: number,
    @QueryParam() offset?: number,
  ): Promise<UserSummary[]> {
    return await userService.searchUsers(req.user!.userId, { search, limit, offset });
  }

  @Get('me')
  @Security('jwt')
  @Response(404, 'User not found')
  public async getProfile(@Request() req: AuthenticatedRequest): Promise<User> {
    const user = await userService.getUser(req.user!.userId);
    if (!user) throw new NotFoundError('User not found');

    return user;
  }
}
