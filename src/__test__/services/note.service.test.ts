import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noteService } from '../../services/note.service';
import { noteRepository } from '../../repositories/note.repository';
import { ForbiddenError } from '../../errors';

vi.mock('../../repositories/note.repository', () => ({
  noteRepository: {
    listUserNotes: vi.fn(),
    createNote: vi.fn(),
    findNoteWithNoteOnUser: vi.fn(),
    assignNoteToUser: vi.fn(),
  },
}));

const notes = vi.mocked(noteRepository);

const noteWithCallerRole = (role: 'USER' | 'MOD' | 'ADMIN' | null) => ({
  id: 10,
  uuid: 'n-10',
  title: 'Title',
  content: 'Content',
  authorId: 1,
  createdAt: new Date(),
  users: role ? [{ noteId: 10, userId: 1, assignedById: 1, assignedAt: new Date(), role }] : [],
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('NoteService.listUserNotes', () => {
  it('returns the notes assigned to the user', async () => {
    const list = [{ noteId: 10 }];
    notes.listUserNotes.mockResolvedValue(list as never);

    expect(await noteService.listUserNotes(1)).toBe(list);
    expect(notes.listUserNotes).toHaveBeenCalledWith(1);
  });
});

describe('NoteService.createNote', () => {
  it('creates the note for its author', async () => {
    const note = { id: 10 };
    notes.createNote.mockResolvedValue(note as never);

    expect(await noteService.createNote('Title', 'Content', 1)).toBe(note);
    expect(notes.createNote).toHaveBeenCalledWith('Title', 'Content', 1);
  });
});

describe('NoteService.assignNoteToUser', () => {
  it('looks up the note together with the caller’s own assignment', async () => {
    notes.findNoteWithNoteOnUser.mockResolvedValue(noteWithCallerRole('ADMIN'));

    await noteService.assignNoteToUser(10, 2, 1);

    expect(notes.findNoteWithNoteOnUser).toHaveBeenCalledWith(10, 1);
  });

  it('forbids assigning a note that does not exist', async () => {
    notes.findNoteWithNoteOnUser.mockResolvedValue(null);

    await expect(noteService.assignNoteToUser(10, 2, 1)).rejects.toThrow(
      new ForbiddenError('Note not found or you do not have access to it'),
    );
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it('forbids a caller who is not assigned to the note', async () => {
    notes.findNoteWithNoteOnUser.mockResolvedValue(noteWithCallerRole(null));

    await expect(noteService.assignNoteToUser(10, 2, 1)).rejects.toThrow(ForbiddenError);
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it('forbids a caller with the USER role on the note', async () => {
    notes.findNoteWithNoteOnUser.mockResolvedValue(noteWithCallerRole('USER'));

    await expect(noteService.assignNoteToUser(10, 2, 1)).rejects.toThrow(
      new ForbiddenError('Only users with sufficient permissions can assign notes to other users'),
    );
    expect(notes.assignNoteToUser).not.toHaveBeenCalled();
  });

  it.each(['MOD', 'ADMIN'] as const)('allows a caller with the %s role', async (role) => {
    const assignment = { noteId: 10, userId: 2 };
    notes.findNoteWithNoteOnUser.mockResolvedValue(noteWithCallerRole(role));
    notes.assignNoteToUser.mockResolvedValue(assignment as never);

    expect(await noteService.assignNoteToUser(10, 2, 1)).toBe(assignment);
    expect(notes.assignNoteToUser).toHaveBeenCalledWith(10, 2, 1);
  });
});
