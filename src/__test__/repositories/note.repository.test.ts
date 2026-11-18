import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  noteRepository,
  publicNoteOnUserSelect,
  publicNoteOnUserWithNoteSelect,
  publicNoteSelect,
} from '../../repositories/note.repository';

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

describe('public note selects', () => {
  it('select only uuids for related records, never numeric ids', () => {
    expect(publicNoteSelect).toEqual({
      uuid: true,
      title: true,
      content: true,
      createdAt: true,
      author: { select: { uuid: true } },
    });
    expect(publicNoteOnUserSelect).toEqual({
      role: true,
      assignedAt: true,
      note: { select: { uuid: true } },
      user: { select: { uuid: true } },
      assignedBy: { select: { uuid: true } },
    });
    expect(publicNoteOnUserWithNoteSelect).toEqual({
      ...publicNoteOnUserSelect,
      note: { select: publicNoteSelect },
    });
  });
});

describe('NoteRepository', () => {
  it('listUserNotes returns the user’s assignments with their public notes', async () => {
    prisma.noteOnUser.findMany.mockResolvedValue([]);

    await noteRepository.listUserNotes(1);

    expect(prisma.noteOnUser.findMany).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: publicNoteOnUserWithNoteSelect,
    });
  });

  it('findNoteAccess looks the note up by uuid with only the given user’s role', async () => {
    const access = { id: 10, users: [{ role: 'ADMIN' }] };
    prisma.note.findUnique.mockResolvedValue(access);

    expect(await noteRepository.findNoteAccess('n-uuid', 1)).toBe(access);
    expect(prisma.note.findUnique).toHaveBeenCalledWith({
      where: { uuid: 'n-uuid' },
      select: { id: true, users: { where: { userId: 1 }, select: { role: true } } },
    });
  });

  it('createNote makes the author an ADMIN and returns only public fields', async () => {
    prisma.note.create.mockResolvedValue({ uuid: 'n-uuid' });

    await noteRepository.createNote('Title', 'Content', 1);

    expect(prisma.note.create).toHaveBeenCalledWith({
      data: {
        title: 'Title',
        content: 'Content',
        authorId: 1,
        users: { create: { userId: 1, assignedById: 1, role: 'ADMIN' } },
      },
      select: publicNoteSelect,
    });
  });

  it('assignNoteToUser records who made the assignment and returns only public fields', async () => {
    prisma.noteOnUser.create.mockResolvedValue({});

    await noteRepository.assignNoteToUser(10, 2, 1);

    expect(prisma.noteOnUser.create).toHaveBeenCalledWith({
      data: { noteId: 10, userId: 2, assignedById: 1 },
      select: publicNoteOnUserSelect,
    });
  });
});
