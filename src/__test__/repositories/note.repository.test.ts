import { describe, it, expect, vi, beforeEach } from 'vitest';
import { noteRepository } from '../../repositories/note.repository';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    note: { create: vi.fn(), findUnique: vi.fn() },
    noteOnUser: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('../../config/db', () => ({ prisma }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('NoteRepository', () => {
  it('listUserNotes returns the user’s assignments with their notes', async () => {
    prisma.noteOnUser.findMany.mockResolvedValue([]);

    await noteRepository.listUserNotes(1);

    expect(prisma.noteOnUser.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      include: { note: true },
    });
  });

  it('findNoteWithNoteOnUser includes only the given user’s assignment', async () => {
    prisma.note.findUnique.mockResolvedValue(null);

    await noteRepository.findNoteWithNoteOnUser(10, 1);

    expect(prisma.note.findUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      include: { users: { where: { userId: 1 } } },
    });
  });

  it('createNote makes the author an ADMIN of the new note', async () => {
    prisma.note.create.mockResolvedValue({ id: 10 });

    await noteRepository.createNote('Title', 'Content', 1);

    expect(prisma.note.create).toHaveBeenCalledWith({
      data: {
        title: 'Title',
        content: 'Content',
        authorId: 1,
        users: { create: { userId: 1, assignedById: 1, role: 'ADMIN' } },
      },
    });
  });

  it('assignNoteToUser records who made the assignment', async () => {
    prisma.noteOnUser.create.mockResolvedValue({});

    await noteRepository.assignNoteToUser(10, 2, 1);

    expect(prisma.noteOnUser.create).toHaveBeenCalledWith({
      data: { noteId: 10, userId: 2, assignedById: 1 },
    });
  });
});
