import { randomBytes, scryptSync } from 'node:crypto';
import { hashPassword, passwordNeedsRehash, verifyPassword } from './password-hash';

/** The format written before hashes were versioned: Node's default scrypt, hex salt used as text. */
function legacyHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

describe('password hashing', () => {
  it('stores the algorithm and its cost parameters with every hash', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(hash).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct horse battery!', hash)).resolves.toBe(false);
    expect(passwordNeedsRehash(hash)).toBe(false);
    expect(await hashPassword('correct horse battery')).not.toBe(hash);
  });

  it('still accepts legacy hashes and marks them for rehashing', async () => {
    const hash = legacyHash('old-password');

    await expect(verifyPassword('old-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('other-password', hash)).resolves.toBe(false);
    expect(passwordNeedsRehash(hash)).toBe(true);
  });

  it('verifies weaker versioned hashes and asks to upgrade them', async () => {
    const salt = randomBytes(16);
    const derived = scryptSync('password', salt, 64, { N: 16384, r: 8, p: 1 });
    const hash = `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;

    await expect(verifyPassword('password', hash)).resolves.toBe(true);
    expect(passwordNeedsRehash(hash)).toBe(true);
  });

  it('rejects malformed hashes and unsafe parameters without throwing', async () => {
    const salt = randomBytes(16).toString('base64url');
    const derived = randomBytes(64).toString('base64url');
    for (const hash of [
      '',
      'not-used-by-e2e',
      'salt-only:',
      `scrypt$32768$8$3$${salt}`,
      `scrypt$1073741824$8$1$${salt}$${derived}`,
      `scrypt$30000$8$1$${salt}$${derived}`,
      `scrypt$32768$64$1$${salt}$${derived}`,
      `scrypt$32768$8$0$${salt}$${derived}`,
      `scrypt$32768$8$3$$${derived}`,
      `argon2id$v=19$m=65536,t=3,p=4$${salt}$${derived}`,
    ]) {
      await expect(verifyPassword('password', hash)).resolves.toBe(false);
      expect(passwordNeedsRehash(hash)).toBe(true);
    }
  });
});
