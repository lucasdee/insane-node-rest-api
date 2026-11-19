import {
  Controller,
  Get,
  Route,
  Security,
  Tags,
  Request,
  Post,
  Body,
  Response,
} from '@tsoa/runtime';
import { AuthenticatedRequest } from './types';
import { noteService } from '../services/note.service';
import { Note, NoteOnUser, NoteCreateRequest, NoteOnUserCreateRequest } from '../dtos/note.dto';

@Route('notes')
@Tags('Notes')
export class NotesController extends Controller {
  @Get('')
  @Security('jwt')
  public async listMyNotes(@Request() req: AuthenticatedRequest): Promise<NoteOnUser[]> {
    return await noteService.listUserNotes(req.user!.userId);
  }

  @Post('create')
  @Security('jwt')
  public async createNote(
    @Request() req: AuthenticatedRequest,
    @Body() body: NoteCreateRequest,
  ): Promise<Note> {
    return await noteService.createNote(body.title, body.content, req.user!.userId);
  }

  @Post('assign')
  @Security('jwt')
  @Response(403, 'Note not found or you do not have access to it')
  @Response(404, 'User not found')
  @Response(409, 'The user is already assigned to the note')
  public async assignNoteToUser(
    @Request() req: AuthenticatedRequest,
    @Body() body: NoteOnUserCreateRequest,
  ): Promise<NoteOnUser> {
    return await noteService.assignNoteToUser(body.noteUuid, body.userUuid, req.user!.userId);
  }
}
