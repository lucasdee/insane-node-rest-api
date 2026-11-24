import {
  Controller,
  Get,
  Route,
  Security,
  Tags,
  Request,
  Post,
  Put,
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
  MemoOnUser,
  MemoCreateRequest,
  MemoOnUserCreateRequest,
  MemoTagsUpdateRequest,
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

  /** Replaces all of a memo's tags. Only the memo's ADMINs and MODs can do this. */
  @Put('{memoUuid}/tags')
  @Security('jwt')
  @Response(
    403,
    'Memo not found or you do not have access to it, or your role on the memo does not allow changing its tags',
  )
  public async replaceMemoTags(
    @Request() req: AuthenticatedRequest,
    @Path() memoUuid: string,
    @Body() body: MemoTagsUpdateRequest,
  ): Promise<Memo> {
    return await memoService.replaceMemoTags(memoUuid, body.tags, req.user!.userId);
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
