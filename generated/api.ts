/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

/** What other users may see of a user: enough to pick them, nothing private. */
export interface UserSummary {
  /** @example "123e4567-e89b-12d3-a456-426614174000" */
  uuid: string;
  /** @example "jdoe" */
  username: string;
  /** @example "John Doe" */
  displayName?: string | null;
}

export interface User {
  /** @example "123e4567-e89b-12d3-a456-426614174000" */
  uuid: string;
  /** @example "admin" */
  username: string;
  /** @example "admin@example.com" */
  email: string;
  /** @example "John Doe" */
  displayName?: string | null;
  /** @example "USER" */
  role: "USER" | "MOD" | "ADMIN";
  /**
   * @format date-time
   * @example "2024-01-01T00:00:00.000Z"
   */
  createdAt: string;
}

export interface TagCount {
  /** @example "groceries" */
  name: string;
  /**
   * How many of the caller's memos carry the tag.
   * @format double
   * @example 3
   */
  memoCount: number;
}

export interface Memo {
  /** @example "123e4567-e89b-12d3-a456-426614174000" */
  uuid: string;
  /** @example "My first memo" */
  title: string;
  /** @example "This is the content of my first memo." */
  content: string;
  /** @example "5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b" */
  authorUuid: string;
  /** @example "alice" */
  authorUsername: string;
  /**
   * The author's display name, or null if they have not set one.
   * @example "Alice"
   */
  authorDisplayName: string | null;
  /**
   * @format date-time
   * @example "2024-01-01T00:00:00.000Z"
   */
  createdAt: string;
  /**
   * The memo's tags, lowercased and sorted.
   * @example ["groceries","home"]
   */
  tags: string[];
}

export interface MemoOnUser {
  /** @example "123e4567-e89b-12d3-a456-426614174000" */
  memoUuid: string;
  /** @example "9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e" */
  userUuid: string;
  /** @example "5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b" */
  assignedByUuid: string;
  /**
   * @format date-time
   * @example "2024-01-01T00:00:00.000Z"
   */
  assignedAt: string;
  /** @example "USER" */
  role: "USER" | "MOD" | "ADMIN";
  memo?: Memo;
}

/**
 * A tag name. It is stored lowercased, so "Home" and "home" are the same tag.
 * @pattern ^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$
 */
export type TagName = string;

export interface MemoCreateRequest {
  /**
   * @minLength 3
   * @maxLength 128
   * @example "My first memo"
   */
  title: string;
  /**
   * @minLength 3
   * @maxLength 10000
   * @example "This is the content of my first memo."
   */
  content: string;
  /**
   * Tags to put on the memo. Duplicates (ignoring case) are merged.
   * @maxItems 10
   * @example ["groceries","home"]
   */
  tags?: TagName[];
}

/** A user a memo is assigned to, with their role on it and who assigned them. */
export interface MemoAssignment {
  /** @example "9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e" */
  userUuid: string;
  /** @example "bob" */
  username: string;
  /**
   * The assignee's display name, or null if they have not set one.
   * @example "Bob"
   */
  displayName: string | null;
  /**
   * The assignee's role on the memo, not their global role.
   * @example "USER"
   */
  role: "USER" | "MOD" | "ADMIN";
  /**
   * @format date-time
   * @example "2024-01-01T00:00:00.000Z"
   */
  assignedAt: string;
  /** @example "5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b" */
  assignedByUuid: string;
  /** @example "alice" */
  assignedByUsername: string;
  /**
   * The display name of whoever assigned the user, or null if they have not set one.
   * @example "Alice"
   */
  assignedByDisplayName: string | null;
}

/** Changes to a memo. Fields left out stay as they are. */
export interface MemoUpdateRequest {
  /**
   * @minLength 3
   * @maxLength 128
   * @example "My edited memo"
   */
  title?: string;
  /**
   * @minLength 3
   * @maxLength 10000
   * @example "This is the edited content of my memo."
   */
  content?: string;
  /**
   * The memo's new tags, replacing all current ones. An empty list removes them all.
   * Duplicates (ignoring case) are merged.
   * @maxItems 10
   * @example ["groceries","home"]
   */
  tags?: TagName[];
}

export interface MemoOnUserCreateRequest {
  /**
   * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$
   * @example "123e4567-e89b-12d3-a456-426614174000"
   */
  memoUuid: string;
  /**
   * @pattern ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$
   * @example "9b2d7c1e-4f3a-4b6c-9d8e-7f6a5b4c3d2e"
   */
  userUuid: string;
  /**
   * The assignee's role on the memo. Defaults to USER. Only the memo's ADMINs can
   * assign MOD or ADMIN.
   * @example "USER"
   */
  role?: "USER" | "MOD" | "ADMIN";
}

export interface RegisterRequest {
  /**
   * @minLength 3
   * @maxLength 64
   * @example "newuser"
   */
  username: string;
  /**
   * @minLength 6
   * @maxLength 72
   * @example "secret123"
   */
  password: string;
  /**
   * @format email
   * @maxLength 128
   * @pattern ^(.+)@(.+)\.(.+)$
   * @example "user@example.com"
   */
  email: string;
  /**
   * @maxLength 64
   * @example "John Doe"
   */
  displayName?: string | null;
}

export interface AuthResponse {
  /** @example "eyJhbGciOiJI..." */
  accessToken: string;
  /**
   * @format double
   * @example 1772719299
   */
  accessTokenExpiresOn: number;
  /**
   * @format double
   * @example 1773324099
   */
  refreshTokenExpiresOn: number;
}

export interface LoginRequest {
  /**
   * @minLength 1
   * @maxLength 64
   * @example "admin"
   */
  username: string;
  /**
   * @minLength 1
   * @maxLength 72
   * @example "admin"
   */
  password: string;
}

export type QueryParamsType = Record<string | number, any>;
export type ResponseFormat = keyof Omit<Body, "body" | "bodyUsed">;

export interface FullRequestParams extends Omit<RequestInit, "body"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseFormat;
  /** request body */
  body?: unknown;
  /** base url */
  baseUrl?: string;
  /** request cancellation token */
  cancelToken?: CancelToken;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown> {
  baseUrl?: string;
  baseApiParams?: Omit<RequestParams, "baseUrl" | "cancelToken" | "signal">;
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<RequestParams | void> | RequestParams | void;
  customFetch?: typeof fetch;
}

export interface HttpResponse<D extends unknown, E extends unknown = unknown>
  extends Response {
  data: D;
  error: E;
}

type CancelToken = Symbol | string | number;

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public baseUrl: string = "/";
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private abortControllers = new Map<CancelToken, AbortController>();
  private customFetch = (...fetchParams: Parameters<typeof fetch>) =>
    fetch(...fetchParams);

  private baseApiParams: RequestParams = {
    credentials: "same-origin",
    headers: {},
    redirect: "follow",
    referrerPolicy: "no-referrer",
  };

  constructor(apiConfig: ApiConfig<SecurityDataType> = {}) {
    Object.assign(this, apiConfig);
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected encodeQueryParam(key: string, value: any) {
    const encodedKey = encodeURIComponent(key);
    return `${encodedKey}=${encodeURIComponent(typeof value === "number" ? value : `${value}`)}`;
  }

  protected addQueryParam(query: QueryParamsType, key: string) {
    return this.encodeQueryParam(key, query[key]);
  }

  protected addArrayQueryParam(query: QueryParamsType, key: string) {
    const value = query[key];
    return value.map((v: any) => this.encodeQueryParam(key, v)).join("&");
  }

  protected toQueryString(rawQuery?: QueryParamsType): string {
    const query = rawQuery || {};
    const keys = Object.keys(query).filter(
      (key) => "undefined" !== typeof query[key],
    );
    return keys
      .map((key) =>
        Array.isArray(query[key])
          ? this.addArrayQueryParam(query, key)
          : this.addQueryParam(query, key),
      )
      .join("&");
  }

  protected addQueryParams(rawQuery?: QueryParamsType): string {
    const queryString = this.toQueryString(rawQuery);
    return queryString ? `?${queryString}` : "";
  }

  private contentFormatters: Record<ContentType, (input: any) => any> = {
    [ContentType.Json]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.JsonApi]: (input: any) =>
      input !== null && (typeof input === "object" || typeof input === "string")
        ? JSON.stringify(input)
        : input,
    [ContentType.Text]: (input: any) =>
      input !== null && typeof input !== "string"
        ? JSON.stringify(input)
        : input,
    [ContentType.FormData]: (input: any) => {
      if (input instanceof FormData) {
        return input;
      }

      return Object.keys(input || {}).reduce((formData, key) => {
        const property = input[key];
        formData.append(
          key,
          property instanceof Blob
            ? property
            : typeof property === "object" && property !== null
              ? JSON.stringify(property)
              : `${property}`,
        );
        return formData;
      }, new FormData());
    },
    [ContentType.UrlEncoded]: (input: any) => this.toQueryString(input),
  };

  protected mergeRequestParams(
    params1: RequestParams,
    params2?: RequestParams,
  ): RequestParams {
    return {
      ...this.baseApiParams,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...(this.baseApiParams.headers || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected createAbortSignal = (
    cancelToken: CancelToken,
  ): AbortSignal | undefined => {
    if (this.abortControllers.has(cancelToken)) {
      const abortController = this.abortControllers.get(cancelToken);
      if (abortController) {
        return abortController.signal;
      }
      return void 0;
    }

    const abortController = new AbortController();
    this.abortControllers.set(cancelToken, abortController);
    return abortController.signal;
  };

  public abortRequest = (cancelToken: CancelToken) => {
    const abortController = this.abortControllers.get(cancelToken);

    if (abortController) {
      abortController.abort();
      this.abortControllers.delete(cancelToken);
    }
  };

  public request = async <T = any, E = any>({
    body,
    secure,
    path,
    type,
    query,
    format,
    baseUrl,
    cancelToken,
    ...params
  }: FullRequestParams): Promise<HttpResponse<T, E>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.baseApiParams.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const queryString = query && this.toQueryString(query);
    const payloadFormatter = this.contentFormatters[type || ContentType.Json];
    const responseFormat = format || requestParams.format;

    return this.customFetch(
      `${baseUrl || this.baseUrl || ""}${path}${queryString ? `?${queryString}` : ""}`,
      {
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type && type !== ContentType.FormData
            ? { "Content-Type": type }
            : {}),
        },
        signal:
          (cancelToken
            ? this.createAbortSignal(cancelToken)
            : requestParams.signal) || null,
        body:
          typeof body === "undefined" || body === null
            ? null
            : payloadFormatter(body),
      },
    ).then(async (response) => {
      const r = response as HttpResponse<T, E>;
      r.data = null as unknown as T;
      r.error = null as unknown as E;

      const responseToParse = responseFormat ? response.clone() : response;
      const data = !responseFormat
        ? r
        : await responseToParse[responseFormat]()
            .then((data) => {
              if (r.ok) {
                r.data = data;
              } else {
                r.error = data;
              }
              return r;
            })
            .catch((e) => {
              r.error = e;
              return r;
            });

      if (cancelToken) {
        this.abortControllers.delete(cancelToken);
      }

      if (!response.ok) throw data;
      return data;
    });
  };
}

/**
 * @title insane-node-rest-api
 * @version 1.0.0
 * @license MIT
 * @baseUrl /
 * @contact lucasdee
 *
 * A compact, fully-typed REST API starter using Node.js, TypeScript, Express, Prisma (MySQL/MariaDB), and tsoa for OpenAPI generation.
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  users = {
    /**
     * @description Lists other users, ordered by username, for example to pick whom to assign a memo to. Only uuid, username and display name are returned. You are never in the list.
     *
     * @tags Users
     * @name SearchUsers
     * @request GET:/users
     * @secure
     */
    searchUsers: (
      query?: {
        /**
         * Only users whose username or display name contains this, ignoring case.
         * @minLength 1
         * @maxLength 64
         */
        search?: string;
        /**
         * How many users to return, 20 by default.
         * @format int32
         * @min 1
         * @max 50
         */
        limit?: number;
        /**
         * How many users to skip, for paging.
         * @format int32
         * @min 0
         */
        offset?: number;
      },
      params: RequestParams = {},
    ) =>
      this.request<UserSummary[], any>({
        path: `/users`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Users
     * @name GetProfile
     * @request GET:/users/me
     * @secure
     */
    getProfile: (params: RequestParams = {}) =>
      this.request<User, void>({
        path: `/users/me`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  tags = {
    /**
     * @description Lists the tags on memos assigned to you, sorted by name, with how many of them carry each.
     *
     * @tags Tags
     * @name ListMyTags
     * @request GET:/tags
     * @secure
     */
    listMyTags: (params: RequestParams = {}) =>
      this.request<TagCount[], any>({
        path: `/tags`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),
  };
  memos = {
    /**
     * @description Lists the memos assigned to you, optionally filtered by tags.
     *
     * @tags Memos
     * @name ListMyMemos
     * @request GET:/memos
     * @secure
     */
    listMyMemos: (
      query?: {
        /**
         * Only memos with these tags. Repeat the parameter for several: `?tags=a&tags=b`.
         * @maxItems 10
         */
        tags?: TagName[];
        /** `all` (the default): memos carrying every given tag. `any`: memos carrying at least one. */
        match?: "all" | "any";
      },
      params: RequestParams = {},
    ) =>
      this.request<MemoOnUser[], any>({
        path: `/memos`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Memos
     * @name CreateMemo
     * @request POST:/memos/create
     * @secure
     */
    createMemo: (data: MemoCreateRequest, params: RequestParams = {}) =>
      this.request<Memo, any>({
        path: `/memos/create`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Returns your assignment to a memo, with the memo.
     *
     * @tags Memos
     * @name GetMemo
     * @request GET:/memos/{memoUuid}
     * @secure
     */
    getMemo: (memoUuid: string, params: RequestParams = {}) =>
      this.request<MemoOnUser, void>({
        path: `/memos/${memoUuid}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Changes a memo's title, content and tags. Fields left out stay as they are. Only the memo's author, ADMINs and MODs can do this.
     *
     * @tags Memos
     * @name UpdateMemo
     * @request PATCH:/memos/{memoUuid}
     * @secure
     */
    updateMemo: (
      memoUuid: string,
      data: MemoUpdateRequest,
      params: RequestParams = {},
    ) =>
      this.request<Memo, void>({
        path: `/memos/${memoUuid}`,
        method: "PATCH",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * @description Deletes a memo for everyone it is assigned to, with its assignments and tag links. Only the memo's author and ADMINs can do this.
     *
     * @tags Memos
     * @name DeleteMemo
     * @request DELETE:/memos/{memoUuid}
     * @secure
     */
    deleteMemo: (memoUuid: string, params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/memos/${memoUuid}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * @description Lists everyone a memo is assigned to, with their role on it and who assigned them, oldest assignment first. Anyone with access to the memo can do this.
     *
     * @tags Memos
     * @name ListMemoAssignments
     * @request GET:/memos/{memoUuid}/assignments
     * @secure
     */
    listMemoAssignments: (memoUuid: string, params: RequestParams = {}) =>
      this.request<MemoAssignment[], void>({
        path: `/memos/${memoUuid}/assignments`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * @description Removes a user's assignment to a memo, so it no longer shows up in their list. Anyone can remove their own (leave the memo), and the ones they made if their role is at least as high as the assignee's. ADMINs can remove any, MODs those with the USER role. The author's assignment can't be removed, not even by the author.
     *
     * @tags Memos
     * @name RemoveMemoAssignment
     * @request DELETE:/memos/{memoUuid}/assignments/{userUuid}
     * @secure
     */
    removeMemoAssignment: (
      memoUuid: string,
      userUuid: string,
      params: RequestParams = {},
    ) =>
      this.request<void, void>({
        path: `/memos/${memoUuid}/assignments/${userUuid}`,
        method: "DELETE",
        secure: true,
        ...params,
      }),

    /**
     * No description
     *
     * @tags Memos
     * @name AssignMemoToUser
     * @request POST:/memos/assign
     * @secure
     */
    assignMemoToUser: (
      data: MemoOnUserCreateRequest,
      params: RequestParams = {},
    ) =>
      this.request<MemoOnUser, void>({
        path: `/memos/assign`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),
  };
  auth = {
    /**
     * No description
     *
     * @tags Auth
     * @name Register
     * @request POST:/auth/register
     */
    register: (data: RegisterRequest, params: RequestParams = {}) =>
      this.request<User, void>({
        path: `/auth/register`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name Login
     * @request POST:/auth/login
     */
    login: (data: LoginRequest, params: RequestParams = {}) =>
      this.request<AuthResponse, void>({
        path: `/auth/login`,
        method: "POST",
        body: data,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name Refresh
     * @request POST:/auth/refresh
     */
    refresh: (params: RequestParams = {}) =>
      this.request<AuthResponse, void>({
        path: `/auth/refresh`,
        method: "POST",
        format: "json",
        ...params,
      }),

    /**
     * @description Ends the session identified by the refresh token cookie. No access token is needed, so a client whose access token has expired can still log out.
     *
     * @tags Auth
     * @name Logout
     * @request POST:/auth/logout
     */
    logout: (params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/auth/logout`,
        method: "POST",
        ...params,
      }),

    /**
     * No description
     *
     * @tags Auth
     * @name RevokeExpiredTokens
     * @request POST:/auth/revoke-expired-tokens
     * @secure
     */
    revokeExpiredTokens: (params: RequestParams = {}) =>
      this.request<void, void>({
        path: `/auth/revoke-expired-tokens`,
        method: "POST",
        secure: true,
        ...params,
      }),
  };
}
