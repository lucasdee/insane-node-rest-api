import { IsString, MinLength } from 'class-validator';
import { Example } from 'tsoa';

export class RegisterRequest {
  @IsString()
  @MinLength(3)
  @Example('newuser')
  username!: string;

  @IsString()
  @MinLength(6)
  @Example('secret123')
  password!: string;
}

export class LoginRequest {
  @IsString()
  @Example('admin')
  username!: string;

  @IsString()
  @Example('admin')
  password!: string;
}

export class AuthResponse {
  @Example('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
  token!: string;
}
