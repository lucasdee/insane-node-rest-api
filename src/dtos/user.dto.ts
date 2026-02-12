import { Example } from 'tsoa';

export class UserProfile {
  @Example(1)
  id!: number;

  @Example('admin')
  username!: string;
}
