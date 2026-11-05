/**
 * Render the P0.5 voice spike: 50 Egyptian words × m/f × two ar-EG neural voices.
 *
 * Default (and `--dry-run`) prints the 200 jobs and does not touch the network.
 * A real run reads AZURE_SPEECH_KEY and AZURE_SPEECH_REGION from the environment
 * or a gitignored .env. It never writes those values to disk or to the log.
 *
 * Do not run a real render until Azure Speech terms allow storing and
 * redistributing the audio (P0.1, human). Do not commit the MP3s.
 *
 *   node scripts/voice-spike/render.mjs --dry-run
 */
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DEFAULT_INTERVAL_MS,
  FFMPEG_AUDIO_FILTER,
  FFMPEG_HINT,
  OUTPUT_FORMAT,
  assertWordList,
  ffmpegMissingMessage,
  formatDryRun,
  parseArgs,
  parseEnvText,
  retryWaitMs,
  shouldDryRun,
  withCacheStatus,
  buildJobs,
} from './plan.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

const HELP = `Usage: node scripts/voice-spike/render.mjs [--dry-run]

--dry-run                 Print 200 jobs (key, gender, voice, text, cache hit/miss) and exit.
                          This is the default when AZURE_SPEECH_KEY is missing.
--words <file>            Word list JSON. Default: content/voice-spike/words.json
--out <dir>               MP3 directory. Default: app/public/voice-spike
--cache <file>            Cache JSON (hashes only, no audio). Default: scripts/voice-spike/out/cache.json
--min-interval-ms <n>     Pause between TTS requests. Default ${DEFAULT_INTERVAL_MS} (under the F0 cap of 20/min).
                          Use 750–1000 only on a paid tier that allows ~1–2 req/s.

Environment (never commit, never logged): AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, optional FFMPEG_PATH.
A gitignored .env at the repo root or in scripts/voice-spike/ is read only on a real run.
`;

const ENV_KEYS = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'FFMPEG_PATH'];

function defaults() {
  return {
    words: path.join(repoRoot, 'content/voice-spike/words.json'),
    outDir: path.join(repoRoot, 'app/public/voice-spike'),
    cache: path.join(repoRoot, 'scripts/voice-spike/out/cache.json'),
    minIntervalMs: DEFAULT_INTERVAL_MS,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), defaults());
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const words = assertWordList(JSON.parse(await readFile(args.words, 'utf8')));
  const cache = await readCache(args.cache);
  const jobs = withCacheStatus(buildJobs(words), cache, await listFiles(args.outDir));
  if (args.dryRun) {
    process.stdout.write(formatDryRun(jobs));
    return;
  }
  const env = await loadSpeechEnv();
  if (shouldDryRun({ dryRunFlag: false, hasKey: env.hasKey })) {
    process.stderr.write('AZURE_SPEECH_KEY is not set. Falling back to dry-run. No network.\n');
    process.stdout.write(formatDryRun(jobs));
    return;
  }
  await renderReal(jobs, env, args, cache);
}

async function renderReal(jobs, env, args, cache) {
  assertRegion(env.region);
  const ffmpeg = env.ffmpeg;
  await assertFfmpeg(ffmpeg);
  const misses = jobs.filter((job) => job.cache === 'miss');
  const characters = misses.reduce((sum, job) => sum + job.text.length, 0);
  process.stdout.write(
    [
      `Real render. ${misses.length} requests, about ${characters} spoken characters. ${jobs.length - misses.length} cache hits spend 0 characters.`,
      'Run this only after Azure Speech terms allow storing and redistributing the audio (P0.1). The script does not check the terms.',
      'Clips stay in app/public/voice-spike/. Do not commit them or the key.',
      `Throttle ${args.minIntervalMs} ms between requests. HTTP 429 is retried. Other HTTP errors stop the run.`,
      '',
    ].join('\n'),
  );
  await mkdir(args.outDir, { recursive: true });
  await mkdir(path.dirname(args.cache), { recursive: true });
  let lastStart = 0;
  for (const job of jobs) {
    if (job.cache === 'hit') {
      process.stdout.write(`${job.file}\tcache hit\t0 characters\n`);
      continue;
    }
    const wait = args.minIntervalMs - (Date.now() - lastStart);
    if (lastStart !== 0 && wait > 0) await sleep(wait);
    lastStart = Date.now();
    const bytes = await postSsml(env.region, env.key, job.ssml, job.file);
    const partial = path.join(args.outDir, `${job.file}.partial.mp3`);
    const dest = path.join(args.outDir, job.file);
    try {
      await transcode(ffmpeg, bytes, partial);
      await rename(partial, dest);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
    cache.entries[job.cacheKey] = { file: job.file, characters: job.text.length };
    await writeCache(args.cache, cache);
    process.stdout.write(`${job.file}\tsynthesized\t${job.text.length} characters\n`);
  }
}

async function postSsml(region, key, ssml, label) {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          'User-Agent': 'sawti-voice-spike',
        },
        body: ssml,
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new Error(`TTS request timed out for ${label} after 30 seconds. No further requests were sent.`);
      }
      throw error;
    }
    if (response.status === 429 && attempt < 6) {
      const waitMs = retryWaitMs(attempt, response.headers.get('retry-after'));
      process.stderr.write(`HTTP 429 for ${label}. Retry ${attempt} of 5 after ${waitMs} ms.\n`);
      await response.arrayBuffer().catch(() => undefined);
      await sleep(waitMs);
      continue;
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 240).replace(/\s+/g, ' ');
      throw new Error(`HTTP ${response.status} for ${label}. ${body}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(`HTTP 429 for ${label} after retries. No further requests were sent.`);
}

function transcode(ffmpeg, mp3Bytes, dest) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-af',
        FFMPEG_AUDIO_FILTER,
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '48k',
        dest,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] },
    );
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(0, 400)}`));
    });
    child.stdin.on('error', reject);
    child.stdin.end(mp3Bytes);
  });
}

async function assertFfmpeg(bin) {
  try {
    await access(bin, constants.X_OK);
  } catch {
    throw new Error(ffmpegMissingMessage(bin));
  }
}

function assertRegion(region) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(region)) {
    throw new Error('AZURE_SPEECH_REGION must be a region name such as eastus. The key was not printed.');
  }
}

/**
 * Read the key and region only for a real run. Existing process env wins.
 * Values are not logged. This function is not called on --dry-run.
 */
async function loadSpeechEnv() {
  /** @type {Record<string, string>} */
  const fromFiles = {};
  for (const file of [path.join(repoRoot, '.env'), path.join(scriptDir, '.env')]) {
    let text = '';
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseEnvText(text);
    for (const name of ENV_KEYS) {
      if (fromFiles[name] === undefined && parsed[name]) fromFiles[name] = parsed[name];
    }
  }
  const key = (process.env.AZURE_SPEECH_KEY ?? fromFiles.AZURE_SPEECH_KEY ?? '').trim();
  const region = (process.env.AZURE_SPEECH_REGION ?? fromFiles.AZURE_SPEECH_REGION ?? '').trim();
  const ffmpeg = (process.env.FFMPEG_PATH ?? fromFiles.FFMPEG_PATH ?? FFMPEG_HINT).trim();
  return { hasKey: key.length > 0, key, region, ffmpeg };
}

async function readCache(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (!parsed || typeof parsed.entries !== 'object' || parsed.entries === null) {
      throw new Error('bad shape');
    }
    return { version: 1, entries: parsed.entries };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { version: 1, entries: {} };
    }
    process.stderr.write(`Cache at ${file} is unreadable. Treating it as empty.\n`);
    return { version: 1, entries: {} };
  }
}

async function writeCache(file, cache) {
  const payload = JSON.stringify({ version: 1, entries: cache.entries }, null, 2);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, payload);
  await rename(tmp, file);
}

async function listFiles(dir) {
  try {
    const names = await readdir(dir);
    return new Set(names);
  } catch {
    return new Set();
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'render failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
