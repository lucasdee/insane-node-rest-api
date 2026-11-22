import { Example } from '@tsoa/runtime';

export class Note {
  @Example('123e4567-e89b-12d3-a456-426614174000')
  uuid!: string;

  @Example('My first note')
  title!: string;

  @Example('This is the content of my first note.')
  content!: string;

  @Example('5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b')
  authorUuid!: string;

  @Example('2024-01-01T00:00:00.000Z')
  createdAt!: Date;
}

export class NoteOnUser {
  @Example('123e4567-e89b-12d3-a456-426614174000')
  noteUuid!: string;

  @Example('9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e')
  userUuid!: string;

  @Example('5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b')
  assignedByUuid!: string;

  @Example('2024-01-01T00:00:00.000Z')
  assignedAt!: Date;

  @Example('USER')
  role!: 'USER' | 'MOD' | 'ADMIN';

  @Example(Note)
  note?: Note;
}

export class NoteCreateRequest {
  /**
   * @isString Please provide a valid title
   * @minLength 3 Please provide a title that is at least 3 characters long
   * @maxLength 128 Please provide a title that is at most 128 characters long
   */
  @Example('My first note')
  title!: string;

  /**
   * @isString Please provide valid content
   * @minLength 3 Please provide content that is at least 3 characters long
   * @maxLength 10000 Please provide content that is at most 10000 characters long
   */
  @Example('This is the content of my first note.')
  content!: string;
}

export class NoteOnUserCreateRequest {
  /**
   * @isString Please provide a valid note UUID
   * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ Please provide a valid note UUID
   */
  @Example('123e4567-e89b-12d3-a456-426614174000')
  noteUuid!: string;

  /**
   * @isString Please provide a valid user UUID
   * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ Please provide a valid user UUID
   */
  @Example('9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e')
  userUuid!: string;

  /**
   * The assignee's role on the note. Defaults to USER. Only the note's ADMINs can
   * assign MOD or ADMIN.
   */
  @Example('USER')
  role?: 'USER' | 'MOD' | 'ADMIN';
}
