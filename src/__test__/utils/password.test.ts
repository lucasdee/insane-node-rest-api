import { describe, it, expect } from 'vitest';
import { ValidateError } from '@tsoa/runtime';
import { assertPasswordFitsBcrypt, MAX_PASSWORD_BYTES } from '../../utils/password';

describe('assertPasswordFitsBcrypt', () => {
  it.each([
    ['72 ASCII characters', 'a'.repeat(72)],
    ['36 two-byte characters (72 bytes)', 'ł'.repeat(36)],
    ['18 four-byte emoji (72 bytes)', '🔑'.repeat(18)],
  ])('accepts %s', (_label, password) => {
    expect(() => assertPasswordFitsBcrypt(password)).not.toThrow();
  });

  it.each([
    ['73 ASCII characters', 'a'.repeat(73)],
    ['37 two-byte characters (74 bytes)', 'ł'.repeat(37)],
    ['19 four-byte emoji (76 bytes)', '🔑'.repeat(19)],
    ['71 ASCII characters and one two-byte character (73 bytes)', `${'a'.repeat(71)}ł`],
  ])('rejects %s', (_label, password) => {
    expect(() => assertPasswordFitsBcrypt(password)).toThrow(ValidateError);
  });

  it('reports the error on body.password without echoing the password', () => {
    let error: unknown;
    try {
      assertPasswordFitsBcrypt('ł'.repeat(37));
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidateError);
    const fields = (error as ValidateError).fields;
    expect(Object.keys(fields)).toEqual(['body.password']);
    expect(fields['body.password'].value).toBeUndefined();
    expect(fields['body.password'].message).toContain(`${MAX_PASSWORD_BYTES} bytes`);
  });
});
