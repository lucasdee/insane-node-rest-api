import { Controller, Get, Route, Security, Tags, Request } from '@tsoa/runtime';
import { AuthenticatedRequest } from './types';
import { memoService } from '../services/memo.service';
import { TagCount } from '../dtos/tag.dto';

@Route('tags')
@Tags('Tags')
export class TagsController extends Controller {
  /** Lists the tags on memos assigned to you, sorted by name, with how many of them carry each. */
  @Get('')
  @Security('jwt')
  public async listMyTags(@Request() req: AuthenticatedRequest): Promise<TagCount[]> {
    return await memoService.listUserTags(req.user!.userId);
  }
}
