import { Example } from '@tsoa/runtime';

export class TagCount {
  @Example('groceries')
  name!: string;

  /** How many of the caller's memos carry the tag. */
  @Example(3)
  memoCount!: number;
}
