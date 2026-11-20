import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noteService } from '../../services/note.service';
import { noteRepository } from '../../repositories/note.repository';
import { userRepository } from '../../repositories/user.repository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../errors';
import { Prisma } from '../../generated/prisma/client';

vi.mock('../../repositories/note.repository', () => ({
  noteRepository: {
    listUserNotes: vi.fn(),
    createNote: vi.fn(),
    findNoteAccess: vi.fn(),
    assignNoteToUser: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: { findIdByUuid: vi.fn() },
}));

const notes = vi.mocked(noteRepository);
const users = vi.mocked(userRepository);

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const assignedAt = new Date('2026-01-02T00:00:00.000Z');

/** A note as the repository returns it (Prisma's nested select shape). */
const publicNote = {
  uuid: 'note-uuid',
  title: 'Title',
  content: 'Content',
  createdAt,
  author: { uuid: 'alice-uuid' },
};

/** The note as the API returns it. */
const noteDto = {
  uuid: 'note-uuid',
  title: 'Title',
  content: 'Content',
  authorUuid: 'alice-uuid',
  createdAt,
};

const publicLink = {
  role: 'USER' as const,
  assignedAt,
  note: { uuid: 'note-uuid' },
  user: { uuid: 'bob-uuid' },
  assignedBy: { uuid: 'alice-uuid' },
};

const linkDto = {
  noteUuid: 'note-uuid',
  userUuid: 'bob-uuid',
  assignedByUuid: 'alice-uuid',
  assignedAt,
  role: 'USER',
};

const accessWithCallerRole = (role: 'USER' | 'MOD' | 'ADMIN' | null) => ({
  id: 10,
  users: role ? [{ role }] : [],
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('NoteService.listUserNotes', () => {
  it('returns the user’s notes with related records flattened to uuids', async () => {
    notes.listUserNotes.mockResolvedValue([{ ...publicLink, note: publicNote }]);

    expect(await noteService.listUserNotes(1)).toEqual([{ ...linkDto, note: noteDto }]);
    expect(notes.listUserNotes).toHaveBeenCalledWith(1);
  });
});

describe('NoteService.createNote', () => {
  it('creates the note for its author and returns it with the author’s uuid', async () => {
    notes.createNote.mockResolvedValue(publicNote);

    expect(await noteService.createNote('Title', 'Content', 1)).toEqual(noteDto);
    expect(notes.createNote).toHaveBeenCalledWith('Title', 'Content', 1);
  });
});

describe('NoteService.assignNoteToUser', () => {
  it('looks up the note by uuid together with the caller’s own role', async () => {
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    notes.assignNoteToUser.mockResolvedValue(publicLink);

    await noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1);

    expect(notes.findNoteAccess).toHaveBeenCalledWith('note-uuid', 1);
  });

  it('forbids assigning a note that does not exist', async () => {
    notes.findNoteAccess.mockResolvedValue(null);

    await expect(noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Note not found or you do not have access to it'),
    );
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it('forbids a caller who is not assigned to the note', async () => {
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole(null));

    await expect(noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1)).rejects.toThrow(
      ForbiddenError,
    );
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it('forbids a caller with the USER role on the note before looking up the target', async () => {
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole('USER'));

    await expect(noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ForbiddenError('Only users with sufficient permissions can assign notes to other users'),
    );
    expect(users.findIdByUuid).not.toHaveBeenCalled();
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(null);

    await expect(noteService.assignNoteToUser('note-uuid', 'missing', 1)).rejects.toThrow(
      new NotFoundError('User not found'),
    );
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it('reports a user who is already assigned as a conflict', async () => {
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    notes.assignNoteToUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed on PRIMARY', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1)).rejects.toThrow(
      new ConflictError('The user is already assigned to the note'),
    );
  });

  it('passes other database errors through unchanged', async () => {
    const fkError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint violated', {
      code: 'P2003',
      clientVersion: 'test',
    });
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole('ADMIN'));
    users.findIdByUuid.mockResolvedValue(2);
    notes.assignNoteToUser.mockRejectedValue(fkError);

    await expect(noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1)).rejects.toBe(fkError);
  });

  it.each(['MOD', 'ADMIN'] as const)('allows a caller with the %s role', async (role) => {
    notes.findNoteAccess.mockResolvedValue(accessWithCallerRole(role));
    users.findIdByUuid.mockResolvedValue(2);
    notes.assignNoteToUser.mockResolvedValue(publicLink);

    expect(await noteService.assignNoteToUser('note-uuid', 'bob-uuid', 1)).toEqual(linkDto);
    expect(users.findIdByUuid).toHaveBeenCalledWith('bob-uuid');
    expect(notes.assignNoteToUser).toHaveBeenCalledWith(10, 2, 1);
  });
});
