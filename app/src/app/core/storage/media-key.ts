/** Flat blob key. OPFS rejects slashes, so the namespace is encoded with "__". */
export function mediaKey(sha256: string, namespace = 'media'): string {
  assertToken(namespace, 'namespace');
  assertToken(sha256, 'sha256');
  return `${namespace}__${sha256}`;
}

function assertToken(value: string, label: string): void {
  if (value.length === 0 || value.includes('/') || value.includes('\\') || value.includes('__')) {
    throw new Error(
      `mediaKey ${label} must be non-empty and must not contain '/', '\\', or '__'`,
    );
  }
}
