import { Example } from '@tsoa/runtime';

export class RegisterRequest {
  /**
   * @isString Please provide a valid username
   * @minLength 3 Please provide a username that is at least 3 characters long
   * @maxLength 64 Please provide a username that is at most 64 characters long
   */
  @Example('newuser')
  username!: string;

  /**
   * @isString Please provide a valid password
   * @minLength 6 Please provide a password that is at least 6 characters long
   * @maxLength 72 Please provide a password that is at most 72 characters long
   */
  @Example('secret123')
  password!: string;

  /**
   * @isString Please provide a valid email address
   * @maxLength 128 Please provide an email address that is at most 128 characters long
   * @format email
   * @pattern ^(.+)@(.+)\.(.+)$ Please provide a valid email address
   */
  @Example('user@example.com')
  email!: string;

  /**
   * @isString Please provide a valid display name
   * @maxLength 64 Please provide a display name that is at most 64 characters long
   */
  @Example('John Doe')
  displayName?: string | null;
}

export class LoginRequest {
  /**
   * @isString Please provide a valid username
   * @minLength 1 Please provide a username that is at least 1 character long
   * @maxLength 64 Please provide a username that is at most 64 characters long
   */
  @Example('admin')
  username!: string;

  /**
   * @isString Please provide a valid password
   * @minLength 1 Please provide a password that is at least 1 character long
   * @maxLength 72 Please provide a password that is at most 72 characters long
   */
  @Example('admin')
  password!: string;
}

export class AuthResponse {
  @Example('eyJhbGciOiJI...')
  accessToken!: string;

  @Example(1772719299)
  accessTokenExpiresOn!: number;

  @Example(1773324099)
  refreshTokenExpiresOn!: number;
}
