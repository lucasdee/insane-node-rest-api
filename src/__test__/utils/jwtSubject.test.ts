import { describe, it, expect } from 'vitest';
import { subjectFor, userIdFromSubject } from '../../utils/jwtSubject';

describe('subjectFor', () => {
  it('issues the user id as a string', () => {
    expect(subjectFor(42)).toBe('42');
  });
});

describe('userIdFromSubject', () => {
  it.each([
    ['a string id', '42', 42],
    ['the subject the API issues', subjectFor(7), 7],
    ['a number, as in tokens issued before subjects were strings', 42, 42],
    ['the largest safe integer', String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('reads %s', (_label, sub, expected) => {
    expect(userIdFromSubject(sub)).toBe(expected);
  });

  it.each([
    ['a missing subject', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a non-numeric string', 'abc'],
    ['digits followed by letters', '42abc'],
    ['zero', '0'],
    ['a leading zero', '042'],
    ['a negative number', '-1'],
    ['a decimal string', '1.5'],
    ['an exponent', '1e3'],
    ['surrounding whitespace', ' 42 '],
    ['an id beyond the safe integer range', '9007199254740993'],
    ['a decimal number', 1.5],
    ['the number zero', 0],
    ['a negative number', -1],
    ['NaN', NaN],
    ['an object', { id: 1 }],
  ])('rejects %s', (_label, sub) => {
    expect(userIdFromSubject(sub)).toBeNull();
  });
});
