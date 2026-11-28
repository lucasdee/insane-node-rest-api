import {
  Controller,
  Get,
  Route,
  Security,
  Tags,
  Request,
  Post,
  Patch,
  Delete,
  Path,
  QueryParam,
  Body,
  Response,
  SuccessResponse,
} from '@tsoa/runtime';
import { AuthenticatedRequest } from './types';
import { memoService } from '../services/memo.service';
import {
  Memo,
  MemoAssignment,
  MemoOnUser,
  MemoCreateRequest,
  MemoOnUserCreateRequest,
  MemoUpdateRequest,
  TagName,
} from '../dtos/memo.dto';

@Route('memos')
@Tags('Memos')
export class MemosController extends Controller {
  /**
   * Lists the memos assigned to you, optionally filtered by tags.
   * @param tags Only memos with these tags. Repeat the parameter for several: `?tags=a&tags=b`.
   * @maxItems tags 10 Please provide at most 10 tags
   * @param match `all` (the default): memos carrying every given tag. `any`: memos carrying at least one.
   */
  @Get('')
  @Security('jwt')
  public async listMyMemos(
    @Request() req: AuthenticatedRequest,
    @QueryParam() tags?: TagName[],
    @QueryParam() match?: 'all' | 'any',
  ): Promise<MemoOnUser[]> {
    return await memoService.listUserMemos(req.user!.userId, tags, match);
  }

  @Post('create')
  @Security('jwt')
  @SuccessResponse(201, 'Created')
  public async createMemo(
    @Request() req: AuthenticatedRequest,
    @Body() body: MemoCreateRequest,
  ): Promise<Memo> {
    return await memoService.createMemo(body.title, body.content, req.user!.userId, body.tags);
  }

  /** Returns your assignment to a memo, with the memo. */
  @Get('{memoUuid}')
  @Security('jwt')
  @Response(403, 'Memo not found or you do not have access to it')
  public async getMemo(
    @Request() req: AuthenticatedRequest,
    @Path() memoUuid: string,
  ): Promise<MemoOnUser> {
    return await memoService.getMemo(memoUuid, req.user!.userId);
  }

  /**
   * Lists everyone a memo is assigned to, with their role on it and who assigned them,
   * oldest assignment first. Anyone with access to the memo can do this.
   */
  @Get('{memoUuid}/assignments')
  @Security('jwt')
  @Response(403, 'Memo not found or you do not have access to it')
  public async listMemoAssignments(
    @Request() req: AuthenticatedRequest,
    @Path() memoUuid: string,
  ): Promise<MemoAssignment[]> {
    return await memoService.listMemoAssignments(memoUuid, req.user!.userId);
  }

  /**
   * Removes a user's assignment to a memo, so it no longer shows up in their list.
   * Anyone can remove their own (leave the memo), and the ones they made if their role is
   * at least as high as the assignee's. ADMINs can remove any, MODs those with the USER
   * role. The author's assignment can't be removed, not even by the author.
   */
  @Delete('{memoUuid}/assignments/{userUuid}')
  @Security('jwt')
  @Response(204, 'No Content')
  @Response(
    403,
    'Memo not found or you do not have access to it, or you may not remove this assignment',
  )
  @Response(404, 'The user is not assigned to the memo')
  public async removeMemoAssignment(
    @Request() req: AuthenticatedRequest,
    @Path() memoUuid: string,
    @Path() userUuid: string,
  ): Promise<void> {
    await memoService.removeAssignment(memoUuid, userUuid, req.user!.userId);
  }

  /**
   * Changes a memo's title, content and tags. Fields left out stay as they are. Only
   * the memo's author, ADMINs and MODs can do this.
   */
  @Patch('{memoUuid}')
  @Security('jwt')
  @Response(
    403,
    'Memo not found or you do not have access to it, or you are neither its author nor one of its ADMINs or MODs',
  )
  public async updateMemo(
    @Request() req: AuthenticatedRequest,
    @Path() memoUuid: string,
    @Body() body: MemoUpdateRequest,
  ): Promise<Memo> {
    return await memoService.updateMemo(memoUuid, body, req.user!.userId);
  }

  /**
   * Deletes a memo for everyone it is assigned to, with its assignments and tag links.
   * Only the memo's author and ADMINs can do this.
   */
  @Delete('{memoUuid}')
  @Security('jwt')
  @Response(204, 'No Content')
  @Response(
    403,
    'Memo not found or you do not have access to it, or you are neither its author nor one of its ADMINs',
  )
  public async deleteMemo(
    @Request() req: AuthenticatedRequest,
    @Path() memoUuid: string,
  ): Promise<void> {
    await memoService.deleteMemo(memoUuid, req.user!.userId);
  }

  @Post('assign')
  @Security('jwt')
  @SuccessResponse(201, 'Created')
  @Response(
    403,
    'Memo not found or you do not have access to it, or your role on the memo does not allow this assignment',
  )
  @Response(404, 'User not found')
  @Response(409, 'The user is already assigned to the memo')
  public async assignMemoToUser(
    @Request() req: AuthenticatedRequest,
    @Body() body: MemoOnUserCreateRequest,
  ): Promise<MemoOnUser> {
    return await memoService.assignMemoToUser(
      body.memoUuid,
      body.userUuid,
      req.user!.userId,
      body.role,
    );
  }
}
