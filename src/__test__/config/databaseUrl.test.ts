import { describe, it, expect } from 'vitest';
import { databaseUrl } from '../../config/databaseUrl';

const db = {
  user: 'app',
  password: 'secret',
  host: 'db.local',
  port: 3306,
  name: 'main',
  shadowName: 'main_shadow',
};

describe('databaseUrl', () => {
  it('builds a mysql URL for the named database', () => {
    expect(databaseUrl(db, 'main_shadow')).toBe('mysql://app:secret@db.local:3306/main_shadow');
  });

  it('encodes characters in the user and password that would break the URL', () => {
    const url = databaseUrl({ ...db, user: 'me@corp', password: 'p@ss:w/rd#1%' }, 'main');

    expect(url).toBe('mysql://me%40corp:p%40ss%3Aw%2Frd%231%25@db.local:3306/main');

    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.username)).toBe('me@corp');
    expect(decodeURIComponent(parsed.password)).toBe('p@ss:w/rd#1%');
    expect(parsed.hostname).toBe('db.local');
    expect(parsed.port).toBe('3306');
    expect(parsed.pathname).toBe('/main');
  });
});
