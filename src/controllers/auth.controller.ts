import {
  Body,
  Controller,
  Middlewares,
  Post,
  Route,
  Tags,
  Security,
  Response,
  Request,
} from '@tsoa/runtime';
import type { Request as ExpressRequest } from 'express';
import { buildRefreshCookie, clearRefreshCookie } from '../utils/cookie';
import { userService } from '../services/user.service';
import { LoginRequest, RegisterRequest, AuthResponse } from '../dtos/auth.dto';
import { User } from '../dtos/user.dto';
import { AuthenticatedRequest } from './types';
import { AuthError } from '../errors';
import { loginRateLimit, refreshRateLimit, registerRateLimit } from '../middlewares/rateLimit';

@Route('auth')
@Tags('Auth')
export class AuthController extends Controller {
  @Post('register')
  @Middlewares(registerRateLimit)
  @Response(409, 'Username is already taken')
  @Response(429, 'Too many requests, please try again later')
  public async register(@Body() body: RegisterRequest): Promise<User> {
    const user = await userService.register(body);
    return user;
  }

  @Post('login')
  @Middlewares(loginRateLimit)
  @Response(429, 'Too many requests, please try again later')
  public async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const tokens = await userService.login(body);
    this.setHeader(
      'Set-Cookie',
      buildRefreshCookie(tokens.refreshToken, tokens.refreshTokenExpiresOn),
    );
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresOn: tokens.accessTokenExpiresOn,
      refreshTokenExpiresOn: tokens.refreshTokenExpiresOn,
    };
  }

  @Post('refresh')
  @Middlewares(refreshRateLimit)
  @Response(429, 'Too many requests, please try again later')
  public async refresh(@Request() req: ExpressRequest): Promise<AuthResponse> {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw new AuthError('No refresh token in cookie');
    const tokens = await userService.refreshAccessToken(refreshToken);
    this.setHeader(
      'Set-Cookie',
      buildRefreshCookie(tokens.refreshToken, tokens.refreshTokenExpiresOn),
    );
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresOn: tokens.accessTokenExpiresOn,
      refreshTokenExpiresOn: tokens.refreshTokenExpiresOn,
    };
  }

  /**
   * Ends the session identified by the refresh token cookie. No access token is
   * needed, so a client whose access token has expired can still log out.
   */
  @Post('logout')
  @Response(204, 'No Content')
  @Response(401, 'Missing, invalid or expired refresh token')
  public async logout(@Request() req: ExpressRequest): Promise<void> {
    // Set on the response directly, not via this.setHeader, so that the cookie is
    // also cleared when logout fails: a rejected cookie is of no use to the client.
    req.res?.setHeader('Set-Cookie', clearRefreshCookie());

    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw new AuthError('No refresh token in cookie');
    await userService.logout(refreshToken);
  }

  @Post('revoke-expired-tokens')
  @Security('jwt')
  @Response(204, 'No Content')
  @Response(403, 'Only admins can revoke expired tokens')
  public async revokeExpiredTokens(@Request() req: AuthenticatedRequest): Promise<void> {
    const userId = parseInt(req.user!.sub, 10);
    await userService.revokeExpiredTokens(userId);
  }
}
