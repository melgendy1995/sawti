// payload.bin is a sequence of frames and nothing else:
// uint32be ciphertextByteLength | 12-byte IV | ciphertext||tag.
// ciphertextByteLength includes the 16-byte GCM tag and excludes the IV and the length field.
// AAD is 5 bytes: uint32be chunkIndex (from 0) then uint8 isLast (1 or 0).
// Only the last frame has isLast 1. Bytes left after it, or a length past the buffer, are corrupt.

export const SAWTI_ENC_FORMAT = 'sawti-enc-1' as const;
export const SAWTI_KDF = 'PBKDF2-SHA256' as const;
export const PBKDF2_ITERATIONS = 600_000 as const;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const CHUNK_SIZE = 4_194_304 as const;
export const KEY_BITS = 256;

const GCM_TAG_BYTES = 16;
const LENGTH_BYTES = 4;
const AAD_BYTES = 5;
const BASE64_CHUNK = 0x2000;

const PASSPHRASE_MESSAGE =
  'كلمة السر غير صحيحة. لم يتغيّر شيء. Wrong passphrase. Nothing was changed.';

const CORRUPT_MESSAGE =
  'الملف تالف. لم يتغيّر شيء. This backup file is damaged. Nothing was changed.';

export interface BackupEnvelope {
  format: 'sawti-enc-1';
  kdf: 'PBKDF2-SHA256';
  iterations: 600000;
  salt: string;
  chunkSize: 4194304;
}

export class BackupCryptoError extends Error {
  readonly code: 'corrupt' | 'passphrase';

  constructor(code: 'corrupt' | 'passphrase') {
    super(code === 'passphrase' ? PASSPHRASE_MESSAGE : CORRUPT_MESSAGE);
    this.name = 'BackupCryptoError';
    this.code = code;
  }
}

interface CipherFrame {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export async function encryptBackupBytes(
  plain: Uint8Array,
  passphrase: string,
): Promise<{ envelope: BackupEnvelope; payload: Uint8Array }> {
  const source = new Uint8Array(plain);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const chunkCount = source.length === 0 ? 1 : Math.ceil(source.length / CHUNK_SIZE);
  const payload = new Uint8Array(
    source.length + chunkCount * (LENGTH_BYTES + IV_BYTES + GCM_TAG_BYTES),
  );
  const view = new DataView(payload.buffer);
  const key = await deriveAesKey(passphrase, salt, 'encrypt');
  let offset = 0;

  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = plainChunk(source, index);
    const isLast = index === chunkCount - 1;
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: asBuffer(iv), additionalData: asBuffer(chunkAad(index, isLast)) },
        key,
        asBuffer(chunk),
      ),
    );
    view.setUint32(offset, encrypted.length, false);
    offset += LENGTH_BYTES;
    payload.set(iv, offset);
    offset += IV_BYTES;
    payload.set(encrypted, offset);
    offset += encrypted.length;
  }

  return {
    envelope: {
      format: SAWTI_ENC_FORMAT,
      kdf: SAWTI_KDF,
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      chunkSize: CHUNK_SIZE,
    },
    payload,
  };
}

export async function decryptBackupBytes(
  envelope: BackupEnvelope,
  payload: Uint8Array,
  passphrase: string,
): Promise<Uint8Array> {
  const salt = saltFromEnvelope(envelope);
  const frames = readFrames(payload);
  const key = await deriveAesKey(passphrase, salt, 'decrypt');
  const parts: Uint8Array[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame === undefined) throw new BackupCryptoError('corrupt');
    const isLast = index === frames.length - 1;
    const plain = await decryptFrame(key, frame, index, isLast);
    if (isLast) {
      if (plain.length > CHUNK_SIZE) throw new BackupCryptoError('corrupt');
    } else if (plain.length !== CHUNK_SIZE) {
      throw new BackupCryptoError('corrupt');
    }
    parts.push(plain);
  }

  return concatBytes(parts);
}

function plainChunk(source: Uint8Array, index: number): Uint8Array {
  if (source.length === 0) return new Uint8Array(0);
  const start = index * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, source.length);
  const chunk = new Uint8Array(end - start);
  chunk.set(source.subarray(start, end));
  return chunk;
}

function chunkAad(chunkIndex: number, isLast: boolean): Uint8Array {
  const aad = new Uint8Array(AAD_BYTES);
  new DataView(aad.buffer).setUint32(0, chunkIndex, false);
  aad[4] = isLast ? 1 : 0;
  return aad;
}

async function deriveAesKey(
  passphrase: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const password = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', asBuffer(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    [usage],
  );
}

async function decryptFrame(
  key: CryptoKey,
  frame: CipherFrame,
  index: number,
  isLast: boolean,
): Promise<Uint8Array> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: asBuffer(frame.iv),
          additionalData: asBuffer(chunkAad(index, isLast)),
        },
        key,
        asBuffer(frame.ciphertext),
      ),
    );
  } catch (error) {
    if (isOperationError(error)) throw new BackupCryptoError('passphrase');
    throw error;
  }
}

function readFrames(payload: Uint8Array): CipherFrame[] {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const frames: CipherFrame[] = [];
  let offset = 0;

  while (offset < payload.length) {
    if (payload.length - offset < LENGTH_BYTES) throw new BackupCryptoError('corrupt');
    const cipherBytes = view.getUint32(offset, false);
    const frameBytes = LENGTH_BYTES + IV_BYTES + cipherBytes;
    if (cipherBytes < GCM_TAG_BYTES || frameBytes > payload.length - offset) {
      throw new BackupCryptoError('corrupt');
    }
    const ivStart = offset + LENGTH_BYTES;
    const cipherStart = ivStart + IV_BYTES;
    const iv = new Uint8Array(IV_BYTES);
    iv.set(payload.subarray(ivStart, cipherStart));
    const ciphertext = new Uint8Array(cipherBytes);
    ciphertext.set(payload.subarray(cipherStart, cipherStart + cipherBytes));
    frames.push({ iv, ciphertext });
    offset += frameBytes;
  }

  if (frames.length === 0) throw new BackupCryptoError('corrupt');
  assertFrameSizes(frames);
  return frames;
}

function assertFrameSizes(frames: readonly CipherFrame[]): void {
  const fullCipher = CHUNK_SIZE + GCM_TAG_BYTES;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (frame === undefined) throw new BackupCryptoError('corrupt');
    const isLast = index === frames.length - 1;
    if (isLast) {
      if (frame.ciphertext.length > fullCipher) throw new BackupCryptoError('corrupt');
    } else if (frame.ciphertext.length !== fullCipher) {
      throw new BackupCryptoError('corrupt');
    }
  }
}

function saltFromEnvelope(envelope: BackupEnvelope): Uint8Array {
  if (typeof envelope !== 'object' || envelope === null) throw new BackupCryptoError('corrupt');
  if (
    envelope.format !== SAWTI_ENC_FORMAT ||
    envelope.kdf !== SAWTI_KDF ||
    envelope.iterations !== PBKDF2_ITERATIONS ||
    envelope.chunkSize !== CHUNK_SIZE ||
    typeof envelope.salt !== 'string'
  ) {
    throw new BackupCryptoError('corrupt');
  }
  const salt = base64ToBytes(envelope.salt);
  if (salt.length !== SALT_BYTES) throw new BackupCryptoError('corrupt');
  return salt;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    const chunk = bytes.subarray(offset, offset + BASE64_CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(data: string): Uint8Array {
  if (data.length === 0 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new BackupCryptoError('corrupt');
  }
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    throw new BackupCryptoError('corrupt');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** TS 6 treats `Uint8Array` as `ArrayBufferLike`. WebCrypto wants `BufferSource`. */
function asBuffer(bytes: Uint8Array): BufferSource {
  return bytes as BufferSource;
}

function isOperationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'OperationError';
}
