/**
 * Pure helpers for the P0.5 voice spike. No network, no env, no files.
 * 50 words × genders m/f × Salma and Shakir = 200 jobs.
 */
import { createHash } from 'node:crypto';

export const VOICES = ['ar-EG-SalmaNeural', 'ar-EG-ShakirNeural'];
export const GENDERS = ['m', 'f'];
export const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
export const DEFAULT_INTERVAL_MS = 3100;
export const FFMPEG_HINT = '/opt/homebrew/bin/ffmpeg';

/** Matches the P0.4 clip profile: mono MP3, 24 kHz, 48 kbps, after trim + loudnorm. */
export const FFMPEG_AUDIO_FILTER =
  'silenceremove=start_periods=1:start_duration=0.02:start_threshold=-40dB:stop_periods=-1:stop_duration=0.2:stop_threshold=-40dB,loudnorm=I=-16:TP=-1.5:LRA=11';

const REQUIRED_SPOKEN = {
  want: { m: 'عايز', f: 'عايزة' },
  hungry: { m: 'جعان', f: 'جعانة' },
  tired: { m: 'تعبان', f: 'تعبانة' },
  happy: { m: 'مبسوط', f: 'مبسوطة' },
  sad: { m: 'زعلان', f: 'زعلانة' },
};

export function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildSsml(text, voice) {
  return (
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-EG">' +
    `<voice name="${escapeXml(voice)}">${escapeXml(text)}</voice>` +
    '</speak>'
  );
}

export function cacheKey(parts) {
  const canonical = JSON.stringify({
    text: parts.text,
    voice: parts.voice,
    outputFormat: parts.outputFormat,
    ssml: parts.ssml,
  });
  return sha256Hex(canonical);
}

export function clipFileName(key, gender, voice) {
  return `${key}.${gender}.${voice}.mp3`;
}

/**
 * @param {unknown} words
 * @returns {Array<{ key: string, category: string, spoken: { m: string, f: string } }>}
 */
export function assertWordList(words) {
  if (!Array.isArray(words) || words.length !== 50) {
    const found = Array.isArray(words) ? words.length : 'not-an-array';
    throw new Error(`words.json must contain 50 items (found ${found}).`);
  }
  const keys = new Set();
  for (const item of words) {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object.');
    const row = /** @type {{ key?: unknown, category?: unknown, spoken?: { m?: unknown, f?: unknown } }} */ (
      item
    );
    if (typeof row.key !== 'string' || !/^[a-z0-9-]+$/.test(row.key)) {
      throw new Error('Each item needs a lowercase key (letters, digits, hyphen).');
    }
    if (keys.has(row.key)) throw new Error(`Duplicate key ${row.key}.`);
    keys.add(row.key);
    if (typeof row.category !== 'string' || row.category.trim() === '') {
      throw new Error(`Item ${row.key} needs a category.`);
    }
    for (const gender of GENDERS) {
      const text = row.spoken?.[gender];
      if (typeof text !== 'string' || text.trim() === '') {
        throw new Error(`Item ${row.key} needs a non-empty spoken.${gender}.`);
      }
    }
  }
  for (const [key, spoken] of Object.entries(REQUIRED_SPOKEN)) {
    const item = words.find((row) => row.key === key);
    if (!item || item.spoken.m !== spoken.m || item.spoken.f !== spoken.f) {
      throw new Error(`Item ${key} must use the Egyptian pair ${spoken.m}/${spoken.f}.`);
    }
  }
  return words;
}

export function buildJobs(words) {
  const jobs = [];
  for (const item of words) {
    for (const gender of GENDERS) {
      const text = item.spoken[gender];
      for (const voice of VOICES) {
        const ssml = buildSsml(text, voice);
        jobs.push({
          key: item.key,
          gender,
          voice,
          text,
          ssml,
          outputFormat: OUTPUT_FORMAT,
          cacheKey: cacheKey({ text, voice, outputFormat: OUTPUT_FORMAT, ssml }),
          file: clipFileName(item.key, gender, voice),
        });
      }
    }
  }
  return jobs;
}

/** A hit spends 0 characters: the hash is cached and the MP3 is already on disk. */
export function withCacheStatus(jobs, cache, files) {
  const entries = cache && typeof cache.entries === 'object' && cache.entries ? cache.entries : {};
  const present = files instanceof Set ? files : new Set(files ?? []);
  return jobs.map((job) => ({
    ...job,
    cache: entries[job.cacheKey] && present.has(job.file) ? 'hit' : 'miss',
  }));
}

export function formatDryRun(jobs) {
  const lines = jobs.map((job) => `${job.key}\t${job.gender}\t${job.voice}\t${job.text}\t${job.cache}`);
  const hits = jobs.filter((job) => job.cache === 'hit').length;
  const misses = jobs.length - hits;
  const hitLabel = hits === 1 ? '1 cache hit' : `${hits} cache hits`;
  const missLabel = misses === 1 ? '1 cache miss' : `${misses} cache misses`;
  lines.push(`${jobs.length} jobs, ${hitLabel}, ${missLabel}. Dry-run: no network, no Azure call.`);
  return `${lines.join('\n')}\n`;
}

export function shouldDryRun({ dryRunFlag, hasKey }) {
  return dryRunFlag || !hasKey;
}

export function parseArgs(argv, defaults) {
  const args = {
    dryRun: false,
    help: false,
    words: defaults.words,
    outDir: defaults.outDir,
    cache: defaults.cache,
    minIntervalMs: defaults.minIntervalMs,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--words') args.words = readOption(argv, (i += 1), arg);
    else if (arg === '--out') args.outDir = readOption(argv, (i += 1), arg);
    else if (arg === '--cache') args.cache = readOption(argv, (i += 1), arg);
    else if (arg === '--min-interval-ms') args.minIntervalMs = parseInterval(readOption(argv, (i += 1), arg));
    else throw new Error(`Unknown argument ${arg}. Use --help.`);
  }
  return args;
}

/** Parse KEY=value lines. Does not read the filesystem. */
export function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const body = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;
    const name = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[name] = value;
  }
  return out;
}

export function ffmpegMissingMessage(bin) {
  if (bin === FFMPEG_HINT) {
    return `ffmpeg is missing or not executable at ${FFMPEG_HINT}. Install it (Homebrew ffmpeg), then rerun.`;
  }
  return `ffmpeg is missing or not executable at ${bin}. On this machine the expected binary is ${FFMPEG_HINT}. Set FFMPEG_PATH if it lives elsewhere.`;
}

export function retryWaitMs(attempt, retryAfterHeader) {
  const header = Number(retryAfterHeader);
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 60000);
  return Math.min(2000 * 2 ** (attempt - 1), 60000);
}

function readOption(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
  return value;
}

function parseInterval(value) {
  if (!/^\d+$/.test(value)) throw new Error('--min-interval-ms must be an integer.');
  const interval = Number(value);
  if (interval < 250 || interval > 60000) {
    throw new Error('--min-interval-ms must be between 250 and 60000.');
  }
  return interval;
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
