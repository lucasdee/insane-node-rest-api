import { prisma } from '../config/db';
import { Role } from '../generated/prisma/enums';
import { NoteGetPayload, NoteOnUserGetPayload } from '../generated/prisma/models';

export class NoteRepository {
  async listUserNotes(
    userId: number,
  ): Promise<NoteOnUserGetPayload<{ include: { note: true } }>[]> {
    return prisma.noteOnUser.findMany({
      where: { userId },
      include: {
        note: true,
      },
    });
  }

  async findNoteWithNoteOnUser(
    noteId: number,
    userId: number,
  ): Promise<NoteGetPayload<{ include: { users: true } }> | null> {
    return prisma.note.findUnique({
      where: { id: noteId },
      include: {
        users: {
          where: { userId },
        },
      },
    });
  }

  async createNote(title: string, content: string, createdById: number) {
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
    });
  }

  async assignNoteToUser(noteId: number, userId: number, assignedById: number) {
    return prisma.noteOnUser.create({
      data: {
        noteId,
        userId,
        assignedById,
      },
    });
  }
}

export const noteRepository = new NoteRepository();
