import { ValidateError } from '@tsoa/runtime';

/** bcrypt only uses the first 72 bytes of a password and silently ignores the rest. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * Rejects passwords longer than bcrypt can use. The DTO's `@maxLength 72` counts
 * characters, but accented letters take 2 bytes in UTF-8 and emoji take 4, so a
 * password within that limit can still exceed 72 bytes.
 *
 * Throws the same 422 ValidateError that tsoa raises for invalid request bodies.
 */
export const assertPasswordFitsBcrypt = (password: string): void => {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new ValidateError(
      {
        'body.password': {
          message:
            'Please provide a shorter password. It can be at most 72 bytes, and characters such as accented letters or emoji take more than one byte',
        },
      },
      'Validation failed',
    );
  }
};
