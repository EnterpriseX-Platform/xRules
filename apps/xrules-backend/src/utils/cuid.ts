// CUID (v1 shape): c + time + counter + fingerprint + random, lowercase base36. Same family Prisma uses for @default(cuid()).
import crypto from 'crypto';
import os from 'os';

let counter = Math.floor(Math.random() * 1679616);
const pad = (s: string, n: number) => s.padStart(n, '0').slice(-n);
const fp = pad((process.pid).toString(36), 2) + pad(Array.from(os.hostname()).reduce((a, c) => a + c.charCodeAt(0), os.hostname().length + 36).toString(36), 2);
const rand = () => pad(crypto.randomBytes(4).readUInt32BE(0).toString(36), 4);

export function cuid(): string {
  counter = (counter + 1) % 1679616;
  return 'c' + Date.now().toString(36) + pad(counter.toString(36), 4) + fp + rand() + rand();
}
