import crypto from 'node:crypto';

function key(): Buffer {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new Error('CREDENTIALS_KEY is not set (32-byte base64 required).');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('CREDENTIALS_KEY must decode to exactly 32 bytes.');
  return buf;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(':');
  if (!ivB64 || !tagB64 || dataB64 === undefined) throw new Error('Invalid ciphertext format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
