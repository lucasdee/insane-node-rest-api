import { Body, Controller, Post, Route, Tags } from '@tsoa/runtime';
import { userService } from '../services/user.service.js';
import { LoginRequest, RegisterRequest, AuthResponse } from '../dtos/auth.dto.js';
import { User } from '../dtos/user.dto.js';

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
    return { token };
  }
}
