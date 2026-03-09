import { noteRepository } from '../repositories/note.repository';
import { Note, NoteOnUser } from '../dtos/note.dto';
import { Role } from '../generated/prisma/enums';
import { ForbiddenError } from '../errors';

export class NoteService {
  async listUserNotes(userId: number): Promise<NoteOnUser[]> {
    return noteRepository.listUserNotes(userId);
  }

  async createNote(title: string, content: string, createdById: number): Promise<Note> {
    return noteRepository.createNote(title, content, createdById);
  }

  async assignNoteToUser(noteId: number, userId: number, assignedById: number) {
    const note = await noteRepository.findNoteWithNoteOnUser(noteId, assignedById);
    if (!note) {
      throw new ForbiddenError('Note not found or you do not have access to it');
    }

    const noteOnUser = note.users?.[0];
    if (!noteOnUser || noteOnUser.role === Role.USER) {
      throw new ForbiddenError('Only users with sufficient permissions can assign notes to other users');
    }

    return noteRepository.assignNoteToUser(noteId, userId, assignedById);
  }
}

export const noteService = new NoteService();
