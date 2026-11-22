import { prisma } from '../config/db';
import { Role } from '../generated/prisma/enums';
import {
  NoteGetPayload,
  NoteOnUserGetPayload,
  NoteOnUserSelect,
  NoteSelect,
} from '../generated/prisma/models';

/**
 * Allowlists of note fields that may be returned to API clients. Related users
 * and notes are identified by their uuid only; numeric ids stay internal.
 */
export const publicNoteSelect = {
  uuid: true,
  title: true,
  content: true,
  createdAt: true,
  author: { select: { uuid: true } },
} satisfies NoteSelect;

export const publicNoteOnUserSelect = {
  role: true,
  assignedAt: true,
  note: { select: { uuid: true } },
  user: { select: { uuid: true } },
  assignedBy: { select: { uuid: true } },
} satisfies NoteOnUserSelect;

export const publicNoteOnUserWithNoteSelect = {
  ...publicNoteOnUserSelect,
  note: { select: publicNoteSelect },
} satisfies NoteOnUserSelect;

export type PublicNote = NoteGetPayload<{ select: typeof publicNoteSelect }>;
export type PublicNoteOnUser = NoteOnUserGetPayload<{ select: typeof publicNoteOnUserSelect }>;
export type PublicNoteOnUserWithNote = NoteOnUserGetPayload<{
  select: typeof publicNoteOnUserWithNoteSelect;
}>;

/** A note's internal id and the given user's role on it, if they have one. */
export type NoteAccess = { id: number; users: { role: Role }[] };

export class NoteRepository {
  async listUserNotes(userId: number): Promise<PublicNoteOnUserWithNote[]> {
    return prisma.noteOnUser.findMany({
      where: { userId },
      select: publicNoteOnUserWithNoteSelect,
    });
  }

  /** For permission checks only. The result contains the note's internal id. */
  async findNoteAccess(noteUuid: string, userId: number): Promise<NoteAccess | null> {
    return prisma.note.findUnique({
      where: { uuid: noteUuid },
      select: {
        id: true,
        users: {
          where: { userId },
          select: { role: true },
        },
      },
    });
  }

  async createNote(title: string, content: string, createdById: number): Promise<PublicNote> {
    return prisma.note.create({
      data: {
        title,
        content,
        authorId: createdById,
        users: {
          create: {
            userId: createdById,
            assignedById: createdById,
            role: Role.ADMIN,
          },
        },
      },
      select: publicNoteSelect,
    });
  }

  async assignNoteToUser(
    noteId: number,
    userId: number,
    assignedById: number,
    role: Role,
  ): Promise<PublicNoteOnUser> {
    return prisma.noteOnUser.create({
      data: {
        noteId,
        userId,
        assignedById,
        role,
      },
      select: publicNoteOnUserSelect,
    });
  }
}

export const noteRepository = new NoteRepository();
