/**
 * Record IDs: `<prefix>_<time><random>`, sortable by creation time.
 * IDs are not secrets, so a non-cryptographic random source is acceptable;
 * the random source is injectable for deterministic tests.
 */
export type RandomSource = () => number;

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const PREFIX_PATTERN = /^[a-z][a-z0-9]{1,11}$/;

function encodeTime(ms: number): string {
  return Math.max(0, Math.floor(ms)).toString(36).padStart(9, '0');
}

function randomChars(count: number, random: RandomSource): string {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return out;
}

export function createId(prefix: string, nowMs: number, random: RandomSource = Math.random): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new RangeError(`Invalid id prefix "${prefix}"`);
  }
  return `${prefix}_${encodeTime(nowMs)}${randomChars(12, random)}`;
}

export function hasIdPrefix(id: string, prefix: string): boolean {
  return id.startsWith(`${prefix}_`);
}
