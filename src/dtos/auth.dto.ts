import { Example } from '@tsoa/runtime';

export class RegisterRequest {
  /**
   * @isString Please provide a valid username
   * @minLength 3 Please provide a username that is at least 3 characters long
   */
  @Example('newuser')
  username!: string;

  /**
   * @isString Please provide a valid password
   * @minLength 6 Please provide a password that is at least 6 characters long
   */
  @Example('secret123')
  password!: string;

  /**
   * @isString Please provide a valid email address
   * @format email
   * @pattern ^(.+)@(.+)\.(.+)$ Please provide a valid email address
   */
  @Example('user@example.com')
  email!: string;

  /**
   * @isString Please provide a valid display name
   */
  @Example('John Doe')
  displayName?: string | null;
}

export class LoginRequest {
  /**
   * @isString Please provide a valid username
   * @minLength 1 Please provide a username that is at least 1 character long
   */
  @Example('admin')
  username!: string;

  /**
   * @isString Please provide a valid password
   * @minLength 1 Please provide a password that is at least 1 character long
   */
  @Example('admin')
  password!: string;
}

export class AuthResponse {
  @Example('eyJhbGciOiJI...')
  accessToken!: string;

  @Example(1772719299)
  accessTokenExpiresOn!: number;

  @Example('d1f2e3c4b5a6...')
  refreshToken!: string;

  @Example(1773324099)
  refreshTokenExpiresOn!: number;
}

export class RefreshRequest {
  /**
   * @isString Please provide a valid refresh token
   * @minLength 1 Please provide a refresh token that is at least 1 character long
   */
  @Example('d1f2e3c4b5a6...')
  refreshToken!: string;
}
