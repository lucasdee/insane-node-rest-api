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
  SuccessResponse,
} from '@tsoa/runtime';
import { AuthenticatedRequest } from './types';
import { memoService } from '../services/memo.service';
import { Memo, MemoOnUser, MemoCreateRequest, MemoOnUserCreateRequest } from '../dtos/memo.dto';

@Route('memos')
@Tags('Memos')
export class MemosController extends Controller {
  @Get('')
  @Security('jwt')
  public async listMyMemos(@Request() req: AuthenticatedRequest): Promise<MemoOnUser[]> {
    return await memoService.listUserMemos(req.user!.userId);
  }

  @Post('create')
  @Security('jwt')
  @SuccessResponse(201, 'Created')
  public async createMemo(
    @Request() req: AuthenticatedRequest,
    @Body() body: MemoCreateRequest,
  ): Promise<Memo> {
    return await memoService.createMemo(body.title, body.content, req.user!.userId);
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
