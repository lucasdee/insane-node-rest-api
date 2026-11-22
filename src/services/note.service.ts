import {
  noteRepository,
  type PublicNote,
  type PublicNoteOnUser,
  type PublicNoteOnUserWithNote,
} from '../repositories/note.repository';
import { userRepository } from '../repositories/user.repository';
import { Note, NoteOnUser } from '../dtos/note.dto';
import { Prisma } from '../generated/prisma/client';
import { Role } from '../generated/prisma/enums';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';

const toNote = (note: PublicNote): Note => ({
  uuid: note.uuid,
  title: note.title,
  content: note.content,
  authorUuid: note.author.uuid,
  createdAt: note.createdAt,
});

const toNoteOnUser = (link: PublicNoteOnUser): NoteOnUser => ({
  noteUuid: link.note.uuid,
  userUuid: link.user.uuid,
  assignedByUuid: link.assignedBy.uuid,
  assignedAt: link.assignedAt,
  role: link.role,
});

const toNoteOnUserWithNote = (link: PublicNoteOnUserWithNote): NoteOnUser => ({
  ...toNoteOnUser(link),
  note: toNote(link.note),
});

export class NoteService {
  async listUserNotes(userId: number): Promise<NoteOnUser[]> {
    const links = await noteRepository.listUserNotes(userId);
    return links.map(toNoteOnUserWithNote);
  }

  async createNote(title: string, content: string, createdById: number): Promise<Note> {
    return toNote(await noteRepository.createNote(title, content, createdById));
  }

  async assignNoteToUser(
    noteUuid: string,
    userUuid: string,
    assignedById: number,
    role: Role = Role.USER,
  ): Promise<NoteOnUser> {
    const note = await noteRepository.findNoteAccess(noteUuid, assignedById);
    if (!note) {
      throw new ForbiddenError('Note not found or you do not have access to it');
    }

    // A note's ADMINs can share it with any role, its MODs only as USER.
    const callerRole = note.users[0]?.role;
    if (!callerRole || callerRole === Role.USER) {
      throw new ForbiddenError(
        'Only users with sufficient permissions can assign notes to other users',
      );
    }
    if (callerRole !== Role.ADMIN && role !== Role.USER) {
      throw new ForbiddenError(`Only the note's ADMINs can assign the ${role} role`);
    }

    const userId = await userRepository.findIdByUuid(userUuid);
    if (userId === null) {
      throw new NotFoundError('User not found');
    }

    try {
      return toNoteOnUser(
        await noteRepository.assignNoteToUser(note.id, userId, assignedById, role),
      );
    } catch (err) {
      // The (noteId, userId) primary key rejects a second assignment. Relying on it
      // instead of checking first also covers two identical requests at once.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('The user is already assigned to the note');
      }
      throw err;
    }
  }
}

export const noteService = new NoteService();
