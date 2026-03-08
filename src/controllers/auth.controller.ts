import { Body, Controller, Post, Route, Tags, Security, Response, Request } from '@tsoa/runtime';
import { userService } from '../services/user.service.js';
import { LoginRequest, RegisterRequest, AuthResponse, RefreshRequest } from '../dtos/auth.dto.js';
import { User } from '../dtos/user.dto.js';
import { AuthenticatedRequest } from './types.js';

@Route('auth')
@Tags('Auth')
export class AuthController extends Controller {
  @Post('register')
  public async register(@Body() body: RegisterRequest): Promise<User> {
    const user = await userService.register(body);
    return user;
  }

  @Post('login')
  public async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const token = await userService.login(body);
    return token;
  }

  @Post('refresh')
  public async refresh(@Body() body: RefreshRequest): Promise<AuthResponse> {
    const token = await userService.refreshAccessToken(body.refreshToken);
    return token;
  }

  @Post('logout')
  @Security('jwt')
  @Response(204, 'No Content')
  public async logout(@Body() body: RefreshRequest): Promise<void> {
    await userService.logout(body.refreshToken);
  }

  @Post('revoke-expired-tokens')
  @Security('jwt')
  @Response(204, 'No Content')
  public async revokeExpiredTokens(@Request() req: AuthenticatedRequest): Promise<void> {
    const userId = parseInt(req.user!.sub, 10);
    await userService.revokeExpiredTokens(userId);
  }
}
