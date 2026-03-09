import { Body, Controller, Post, Route, Tags, Security, Response, Request } from '@tsoa/runtime';
import type { Request as ExpressRequest } from 'express';
import { buildRefreshCookie, clearRefreshCookie } from '../utils/cookie';
import { userService } from '../services/user.service';
import { LoginRequest, RegisterRequest, AuthResponse } from '../dtos/auth.dto';
import { User } from '../dtos/user.dto';
import { AuthenticatedRequest } from './types';
import { AuthError } from '../errors';

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
    const tokens = await userService.login(body);
    this.setHeader('Set-Cookie', buildRefreshCookie(tokens.refreshToken, tokens.refreshTokenExpiresOn));
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresOn: tokens.accessTokenExpiresOn,
      refreshTokenExpiresOn: tokens.refreshTokenExpiresOn,
    };
  }

  @Post('refresh')
  public async refresh(@Request() req: ExpressRequest): Promise<AuthResponse> {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw new AuthError('No refresh token in cookie');
    const tokens = await userService.refreshAccessToken(refreshToken);
    this.setHeader('Set-Cookie', buildRefreshCookie(tokens.refreshToken, tokens.refreshTokenExpiresOn));
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresOn: tokens.accessTokenExpiresOn,
      refreshTokenExpiresOn: tokens.refreshTokenExpiresOn,
    };
  }

  @Post('logout')
  @Security('jwt')
  @Response(204, 'No Content')
  public async logout(@Request() req: ExpressRequest): Promise<void> {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw new AuthError('No refresh token in cookie');
    await userService.logout(refreshToken);
    this.setHeader('Set-Cookie', clearRefreshCookie());
  }

  @Post('revoke-expired-tokens')
  @Security('jwt')
  @Response(204, 'No Content')
  public async revokeExpiredTokens(@Request() req: AuthenticatedRequest): Promise<void> {
    const userId = parseInt(req.user!.sub, 10);
    await userService.revokeExpiredTokens(userId);
  }
}
