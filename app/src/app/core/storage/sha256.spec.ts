import { bytesToHex, hashOfHashes, hashesMatch, sha256Hex } from './sha256';

const encoder = new TextEncoder();

describe('sha256 helpers', () => {
  it('hashes known bytes to the known SHA-256 vector', async () => {
    // FIPS 180-4 test vectors.
    expect(await sha256Hex(encoder.encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex(encoder.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is identical for a Uint8Array and its underlying ArrayBuffer', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const fromView = await sha256Hex(bytes);
    const fromBuffer = await sha256Hex(bytes.buffer);
    expect(fromView).toBe(fromBuffer);
  });

  it('renders bytes as lower-case zero-padded hex', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 16, 255]))).toBe('000f10ff');
  });

  it('folds an ordered list of hashes into one digest that depends on order', async () => {
    const a = await sha256Hex(encoder.encode('abc'));
    const b = await sha256Hex(encoder.encode(''));
    const forward = await hashOfHashes([a, b]);
    const reversed = await hashOfHashes([b, a]);
    expect(forward).toMatch(/^[0-9a-f]{64}$/);
    expect(forward).not.toBe(reversed);
    expect(await hashOfHashes([a, b])).toBe(forward);
  });

  it('matches equal hashes and rejects any difference', () => {
    expect(hashesMatch('abcd', 'abcd')).toBe(true);
    expect(hashesMatch('abcd', 'abce')).toBe(false);
    expect(hashesMatch('abcd', 'abc')).toBe(false);
  });
});
