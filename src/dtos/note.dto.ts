import { Example } from 'tsoa';

export class Note {
  @Example('123e4567-e89b-12d3-a456-426614174000')
  uuid!: string;

  @Example('My first note')
  title!: string;

  @Example('This is the content of my first note.')
  content!: string;

  @Example(1)
  authorId!: number;

  @Example('2024-01-01T00:00:00.000Z')
  createdAt!: Date;
}

export class NoteOnUser {
  @Example(1)
  noteId!: number;

  @Example(1)
  userId!: number;

  @Example(1)
  assignedById!: number;

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
   */
  @Example('My first note')
  title!: string;

  /**
   * @isString Please provide valid content
   * @minLength 3 Please provide content that is at least 3 characters long
   */
  @Example('This is the content of my first note.')
  content!: string;
}

export class NoteOnUserCreateRequest {
  /**
   * @isInt Please provide a valid note ID
   */
  @Example(1)
  noteId!: number;

  /**
   * @isInt Please provide a valid user ID
   */
  @Example(1)
  userId!: number;
}
