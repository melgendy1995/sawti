import { bytesToHex, sha256Hex } from '../storage/sha256';
import { CAREGIVER_PIN_MAX, CAREGIVER_PIN_MIN } from './caregiver-timing';

/** 16 random bytes, lower-case hex. This is the salt stored next to the hash. */
export function newSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * SHA-256 hex of the UTF-8 string `${saltHex}:${pin}`.
 * The PIN is not written anywhere; only this digest is.
 */
export async function hashPin(pin: string, saltHex: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(`${saltHex}:${pin}`));
}

/** Caregiver PIN: digits only, 4 to 8 characters. */
export function isNumericPin(pin: string): boolean {
  return pin.length >= CAREGIVER_PIN_MIN && pin.length <= CAREGIVER_PIN_MAX && /^[0-9]+$/.test(pin);
}

/** Equal-length compare that does not return on the first different character. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
