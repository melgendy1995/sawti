/** Fields the update check reads. `releasedAt` is optional. */
export interface VersionDocument {
  latestVersion: string;
  latestVersionCode: number;
  minSupportedVersionCode: number;
  apkUrl: string;
  certSha256: string;
  releasedAt?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Parses the flat P1.12 document or the nested plan shape (`android` / `web`).
 * Returns null when the version codes or apkUrl are missing. Never throws.
 */
export function parseVersionDocument(value: unknown): VersionDocument | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const android = asRecord(record['android']);
  const web = asRecord(record['web']);
  const topCode = readNumber(record['latestVersionCode']);
  const source = topCode === null && android !== null ? android : record;

  const latestVersionCode = readNumber(source['latestVersionCode']);
  const minSupportedVersionCode = readNumber(source['minSupportedVersionCode']);
  const apkUrl = readString(source['apkUrl']);
  if (latestVersionCode === null || minSupportedVersionCode === null || apkUrl === null) {
    return null;
  }
  const trimmedUrl = apkUrl.trim();
  if (trimmedUrl === '') {
    return null;
  }

  const latestVersion =
    readString(source['latestVersion']) ??
    readString(source['latestVersionName']) ??
    (web === null ? null : readString(web['latestVersion'])) ??
    String(latestVersionCode);

  const certSha256 =
    readString(source['certSha256']) ??
    readString(source['signingCertSha256']) ??
    '';

  const releasedAt = readString(record['releasedAt']) ?? readString(source['releasedAt']);

  return {
    latestVersion,
    latestVersionCode,
    minSupportedVersionCode,
    apkUrl: trimmedUrl,
    certSha256,
    ...(releasedAt === null ? {} : { releasedAt }),
  };
}

/** Only https links are offered. A bad or non-https apkUrl does not crash the check. */
export function httpsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
