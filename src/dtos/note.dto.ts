import { Example } from 'tsoa';

export class Note {
  @Example("123e4567-e89b-12d3-a456-426614174000")
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

  @Example("USER")
  role!: 'USER' | 'MOD' | 'ADMIN';

  @Example(Note)
  note?: Note;
}

export class NoteCreateRequest {
  @Example('My first note')
  title!: string;

  @Example('This is the content of my first note.')
  content!: string;

  @Example(1)
  authorId!: number;
}

export class NoteOnUserCreateRequest {
  @Example(1)
  noteId!: number;

  @Example(1)
  userId!: number;
}
