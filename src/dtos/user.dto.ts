import { Example } from 'tsoa';

export class User {
  @Example('123e4567-e89b-12d3-a456-426614174000')
  uuid!: string;

  @Example('admin')
  username!: string;

  @Example('admin@example.com')
  email!: string;

  @Example('John Doe')
  displayName?: string | null;

  @Example('USER')
  role!: 'USER' | 'MOD' | 'ADMIN';

  @Example('2024-01-01T00:00:00.000Z')
  createdAt!: Date;
}
