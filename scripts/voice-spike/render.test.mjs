import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_INTERVAL_MS,
  OUTPUT_FORMAT,
  VOICES,
  assertWordList,
  buildJobs,
  buildSsml,
  cacheKey,
  escapeXml,
  ffmpegMissingMessage,
  formatDryRun,
  parseArgs,
  parseEnvText,
  retryWaitMs,
  shouldDryRun,
  withCacheStatus,
} from './plan.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('voice-spike plan', () => {
  it('builds 200 jobs from the committed word list', async () => {
    const words = assertWordList(
      JSON.parse(await readFile(path.join(repoRoot, 'content/voice-spike/words.json'), 'utf8')),
    );
    const jobs = buildJobs(words);
    assert.equal(jobs.length, 200);
    assert.equal(new Set(jobs.map((job) => job.file)).size, 200);
    assert.deepEqual(
      jobs.slice(0, 4).map((job) => `${job.gender}:${job.voice}`),
      [
        'm:ar-EG-SalmaNeural',
        'm:ar-EG-ShakirNeural',
        'f:ar-EG-SalmaNeural',
        'f:ar-EG-ShakirNeural',
      ],
    );
    const want = jobs.filter((job) => job.key === 'want');
    assert.deepEqual(
      want.map((job) => job.text),
      ['عايز', 'عايز', 'عايزة', 'عايزة'],
    );
    assert.ok(jobs.every((job) => VOICES.includes(job.voice)));
    assert.ok(jobs.every((job) => job.outputFormat === OUTPUT_FORMAT));
  });

  it('keeps the cache key stable and sensitive to text, voice, and SSML', () => {
    const ssml = buildSsml('عايز', 'ar-EG-SalmaNeural');
    const first = cacheKey({ text: 'عايز', voice: 'ar-EG-SalmaNeural', outputFormat: OUTPUT_FORMAT, ssml });
    const second = cacheKey({ text: 'عايز', voice: 'ar-EG-SalmaNeural', outputFormat: OUTPUT_FORMAT, ssml });
    assert.equal(first, second);
    assert.equal(first.length, 64);
    assert.notEqual(
      first,
      cacheKey({ text: 'عايزة', voice: 'ar-EG-SalmaNeural', outputFormat: OUTPUT_FORMAT, ssml: buildSsml('عايزة', 'ar-EG-SalmaNeural') }),
    );
    assert.notEqual(
      first,
      cacheKey({ text: 'عايز', voice: 'ar-EG-ShakirNeural', outputFormat: OUTPUT_FORMAT, ssml: buildSsml('عايز', 'ar-EG-ShakirNeural') }),
    );
    assert.notEqual(
      first,
      cacheKey({ text: 'عايز', voice: 'ar-EG-SalmaNeural', outputFormat: OUTPUT_FORMAT, ssml: `${ssml} ` }),
    );
  });

  it('escapes XML in SSML and keeps xml:lang ar-EG', () => {
    const raw = `5 < 6 & 7 > "quote" 'apos'`;
    assert.equal(escapeXml(raw), '5 &lt; 6 &amp; 7 &gt; &quot;quote&quot; &apos;apos&apos;');
    const ssml = buildSsml(raw, 'ar-EG-SalmaNeural');
    assert.match(ssml, /xml:lang="ar-EG"/);
    assert.match(ssml, /<voice name="ar-EG-SalmaNeural">5 &lt; 6 &amp; 7 &gt; &quot;quote&quot; &apos;apos&apos;<\/voice>/);
    assert.equal(ssml.includes(raw), false);
    assert.match(buildSsml('عايز', 'ar-EG-SalmaNeural'), /عايز/);
  });

  it('marks a dry-run manifest hit only when the hash and the file both exist', () => {
    const words = fiftyWords();
    const jobs = withCacheStatus(buildJobs(assertWordList(words)), { entries: {} }, []);
    assert.equal(jobs.length, 200);
    assert.ok(jobs.every((job) => job.cache === 'miss'));
    const hitJob = jobs[0];
    const hits = withCacheStatus(
      buildJobs(assertWordList(words)),
      { entries: { [hitJob.cacheKey]: { file: hitJob.file } } },
      [hitJob.file],
    );
    assert.equal(hits[0].cache, 'hit');
    assert.equal(hits.filter((job) => job.cache === 'hit').length, 1);
    const text = formatDryRun(hits);
    const lines = text.trim().split('\n');
    assert.equal(lines.length, 201);
    assert.equal(lines[0], `${hitJob.key}\t${hitJob.gender}\t${hitJob.voice}\t${hitJob.text}\thit`);
    assert.match(lines[200], /^200 jobs, 1 cache hit, 199 cache misses\. Dry-run: no network/);
  });

  it('dry-runs unless a key is present and --dry-run is off', () => {
    assert.equal(shouldDryRun({ dryRunFlag: true, hasKey: true }), true);
    assert.equal(shouldDryRun({ dryRunFlag: false, hasKey: false }), true);
    assert.equal(shouldDryRun({ dryRunFlag: false, hasKey: true }), false);
    assert.equal(DEFAULT_INTERVAL_MS, 3100);
  });

  it('parses flags and env text without reading a secret file', () => {
    const parsed = parseArgs(['--dry-run', '--min-interval-ms', '750'], {
      words: 'words.json',
      outDir: 'out',
      cache: 'cache.json',
      minIntervalMs: DEFAULT_INTERVAL_MS,
    });
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.minIntervalMs, 750);
    assert.deepEqual(parseEnvText('# comment\nexport AZURE_SPEECH_KEY="not-a-real-key"\nAZURE_SPEECH_REGION=eastus\n'), {
      AZURE_SPEECH_KEY: 'not-a-real-key',
      AZURE_SPEECH_REGION: 'eastus',
    });
    assert.match(ffmpegMissingMessage('/opt/bin/ffmpeg'), /\/opt\/homebrew\/bin\/ffmpeg/);
    assert.equal(retryWaitMs(1, '3'), 3000);
    assert.equal(retryWaitMs(1, null), 2000);
    assert.equal(retryWaitMs(3, '0'), 8000);
  });
});

function fiftyWords() {
  const required = [
    { key: 'want', category: 'verb', spoken: { m: 'عايز', f: 'عايزة' } },
    { key: 'hungry', category: 'adjective', spoken: { m: 'جعان', f: 'جعانة' } },
    { key: 'tired', category: 'adjective', spoken: { m: 'تعبان', f: 'تعبانة' } },
    { key: 'happy', category: 'adjective', spoken: { m: 'مبسوط', f: 'مبسوطة' } },
    { key: 'sad', category: 'adjective', spoken: { m: 'زعلان', f: 'زعلانة' } },
  ];
  const rest = Array.from({ length: 45 }, (_, index) => ({
    key: `item${index}`,
    category: 'noun',
    spoken: { m: 'كلمة', f: 'كلمة' },
  }));
  return [...required, ...rest];
}
