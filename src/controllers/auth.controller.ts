import { Body, Controller, Post, Route, Tags } from '@tsoa/runtime';
import { userService } from '../services/user.service.js';
import { LoginRequest, RegisterRequest, AuthResponse } from '../dtos/auth.dto.js';

@Route('auth')
@Tags('Auth')
export class AuthController extends Controller {
  @Post('register')
  public async register(@Body() body: RegisterRequest) {
    const user = await userService.register(body.username, body.password);
    return { id: user.id, username: user.username };
  }

  @Post('login')
  public async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const token = await userService.login(body.username, body.password);
    return { token };
  }
}
