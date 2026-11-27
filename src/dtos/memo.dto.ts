import { Example } from '@tsoa/runtime';

/**
 * A tag name. It is stored lowercased, so "Home" and "home" are the same tag.
 * @pattern ^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$ Tags may only contain letters, digits, "-" and "_", start with a letter or digit, and be at most 32 characters long
 */
export type TagName = string;

export class Memo {
  @Example('123e4567-e89b-12d3-a456-426614174000')
  uuid!: string;

  @Example('My first memo')
  title!: string;

  @Example('This is the content of my first memo.')
  content!: string;

  @Example('5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b')
  authorUuid!: string;

  @Example('alice')
  authorUsername!: string;

  /** The author's display name, or null if they have not set one. */
  @Example('Alice')
  authorDisplayName!: string | null;

  @Example('2024-01-01T00:00:00.000Z')
  createdAt!: Date;

  /** The memo's tags, lowercased and sorted. */
  @Example(['groceries', 'home'])
  tags!: string[];
}

export class MemoOnUser {
  @Example('123e4567-e89b-12d3-a456-426614174000')
  memoUuid!: string;

  @Example('9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e')
  userUuid!: string;

  @Example('5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b')
  assignedByUuid!: string;

  @Example('2024-01-01T00:00:00.000Z')
  assignedAt!: Date;

  @Example('USER')
  role!: 'USER' | 'MOD' | 'ADMIN';

  @Example(Memo)
  memo?: Memo;
}

/** A user a memo is assigned to, with their role on it and who assigned them. */
export class MemoAssignment {
  @Example('9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e')
  userUuid!: string;

  @Example('bob')
  username!: string;

  /** The assignee's display name, or null if they have not set one. */
  @Example('Bob')
  displayName!: string | null;

  /** The assignee's role on the memo, not their global role. */
  @Example('USER')
  role!: 'USER' | 'MOD' | 'ADMIN';

  @Example('2024-01-01T00:00:00.000Z')
  assignedAt!: Date;

  @Example('5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b')
  assignedByUuid!: string;

  @Example('alice')
  assignedByUsername!: string;

  /** The display name of whoever assigned the user, or null if they have not set one. */
  @Example('Alice')
  assignedByDisplayName!: string | null;
}

export class MemoCreateRequest {
  /**
   * @isString Please provide a valid title
   * @minLength 3 Please provide a title that is at least 3 characters long
   * @maxLength 128 Please provide a title that is at most 128 characters long
   */
  @Example('My first memo')
  title!: string;

  /**
   * @isString Please provide valid content
   * @minLength 3 Please provide content that is at least 3 characters long
   * @maxLength 10000 Please provide content that is at most 10000 characters long
   */
  @Example('This is the content of my first memo.')
  content!: string;

  /**
   * Tags to put on the memo. Duplicates (ignoring case) are merged.
   * @maxItems 10 Please provide at most 10 tags
   */
  @Example(['groceries', 'home'])
  tags?: TagName[];
}

/** Changes to a memo. Fields left out stay as they are. */
export class MemoUpdateRequest {
  /**
   * @isString Please provide a valid title
   * @minLength 3 Please provide a title that is at least 3 characters long
   * @maxLength 128 Please provide a title that is at most 128 characters long
   */
  @Example('My edited memo')
  title?: string;

  /**
   * @isString Please provide valid content
   * @minLength 3 Please provide content that is at least 3 characters long
   * @maxLength 10000 Please provide content that is at most 10000 characters long
   */
  @Example('This is the edited content of my memo.')
  content?: string;

  /**
   * The memo's new tags, replacing all current ones. An empty list removes them all.
   * Duplicates (ignoring case) are merged.
   * @maxItems 10 Please provide at most 10 tags
   */
  @Example(['groceries', 'home'])
  tags?: TagName[];
}

export class MemoTagsUpdateRequest {
  /**
   * The memo's new tags, replacing all current ones. An empty list removes them all.
   * @maxItems 10 Please provide at most 10 tags
   */
  @Example(['groceries', 'home'])
  tags!: TagName[];
}

export class MemoOnUserCreateRequest {
  /**
   * @isString Please provide a valid memo UUID
   * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ Please provide a valid memo UUID
   */
  @Example('123e4567-e89b-12d3-a456-426614174000')
  memoUuid!: string;

  /**
   * @isString Please provide a valid user UUID
   * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ Please provide a valid user UUID
   */
  @Example('9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e')
  userUuid!: string;

  /**
   * The assignee's role on the memo. Defaults to USER. Only the memo's ADMINs can
   * assign MOD or ADMIN.
   */
  @Example('USER')
  role?: 'USER' | 'MOD' | 'ADMIN';
}
