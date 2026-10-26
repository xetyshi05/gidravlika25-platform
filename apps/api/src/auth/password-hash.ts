import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Password hashes are self-describing: `scrypt$N$r$p$<salt>$<hash>` (base64url).
 * Raising the cost below upgrades every account on its next successful login.
 * N=2^15, r=8, p=3 is one of the OWASP-equivalent scrypt settings; it needs
 * 32 MiB per hash instead of 128 MiB for N=2^17, which matters under login floods.
 */
const current = { N: 2 ** 15, r: 8, p: 3 } as const;
const saltBytes = 16;
const keyBytes = 64;
const currentPrefix = `scrypt$${current.N}$${current.r}$${current.p}$`;
const maxScryptMemory = 64 * 1024 * 1024;

export async function hashPassword(password: string) {
  const salt = randomBytes(saltBytes);
  const hash = await scrypt(password, salt, keyBytes, current);
  return `${currentPrefix}${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, saved: string) {
  const parsed = parsePasswordHash(saved);
  if (!parsed) return false;
  let actual: Buffer;
  try {
    actual = await scrypt(password, parsed.salt, parsed.hash.length, parsed.options);
  } catch {
    return false;
  }
  return timingSafeEqual(actual, parsed.hash);
}

/** True for legacy and weaker hashes that should be replaced after a successful login. */
export function passwordNeedsRehash(saved: string) {
  return !saved.startsWith(currentPrefix) || !parsePasswordHash(saved);
}

function parsePasswordHash(saved: string) {
  if (saved.startsWith('scrypt$')) {
    const [, n, r, p, salt, hash, ...rest] = saved.split('$');
    const options = { N: Number(n), r: Number(r), p: Number(p) };
    const saltBuffer = Buffer.from(salt ?? '', 'base64url');
    const hashBuffer = Buffer.from(hash ?? '', 'base64url');
    // Bounds keep a corrupted or planted row from turning a login into a DoS.
    const valid =
      rest.length === 0 &&
      Number.isInteger(Math.log2(options.N)) &&
      options.N >= 2 ** 14 &&
      options.N <= 2 ** 20 &&
      Number.isInteger(options.r) &&
      options.r >= 1 &&
      options.r <= 16 &&
      Number.isInteger(options.p) &&
      options.p >= 1 &&
      options.p <= 16 &&
      128 * options.N * options.r <= maxScryptMemory &&
      saltBuffer.length >= 16 &&
      hashBuffer.length >= 32 &&
      hashBuffer.length <= 128;
    return valid ? { options, salt: saltBuffer, hash: hashBuffer } : null;
  }
  // Legacy `hexsalt:hexhash`: Node's default scrypt (N=2^14, r=8, p=1), with the
  // hex salt string itself used as the salt.
  const legacy = /^([0-9a-f]{32}):([0-9a-f]{128})$/.exec(saved);
  if (!legacy) return null;
  return {
    options: { N: 2 ** 14, r: 8, p: 1 },
    salt: Buffer.from(legacy[1], 'utf8'),
    hash: Buffer.from(legacy[2], 'hex'),
  };
}

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      // Node's default limit is exactly 32 MiB, which N=2^15 with r=8 would exceed.
      { ...options, maxmem: maxScryptMemory * 2 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}
