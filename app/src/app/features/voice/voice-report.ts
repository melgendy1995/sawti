/** Anonymous local draft and the paste-able report. No network. No child fields. */

export const VOICE_DRAFT_KEY = 'sawti.voice-spike.draft.v1';

export const RATER_ROLES = ['parent', 'SLP', 'adult volunteer', 'other'] as const;
export type RaterRole = (typeof RATER_ROLES)[number];

export const ROLE_LABELS: Record<RaterRole, string> = {
  parent: 'ولي أمر / parent',
  SLP: 'أخصائي تخاطب / SLP',
  'adult volunteer': 'متطوّع بالغ / adult volunteer',
  other: 'أخرى / other',
};

export interface VoiceDraft {
  role: RaterRole | '';
  salma: number | null;
  shakir: number | null;
  comment: string;
  heard: string[];
}

const HEARD_FILE = /^[a-z0-9-]+\.[mf]\.ar-EG-(?:Salma|Shakir)Neural\.mp3$/;

export function emptyDraft(): VoiceDraft {
  return { role: '', salma: null, shakir: null, comment: '', heard: [] };
}

export function isRaterRole(value: unknown): value is RaterRole {
  return typeof value === 'string' && (RATER_ROLES as readonly string[]).includes(value);
}

export function parseDraft(raw: string | null): VoiceDraft {
  if (!raw) return emptyDraft();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return emptyDraft();
    const row = value as Record<string, unknown>;
    const comment = typeof row['comment'] === 'string' ? row['comment'].slice(0, 500) : '';
    return {
      role: isRaterRole(row['role']) ? row['role'] : '',
      salma: scoreOrNull(row['salma']),
      shakir: scoreOrNull(row['shakir']),
      comment,
      heard: heardOrEmpty(row['heard']),
    };
  } catch {
    return emptyDraft();
  }
}

export function formatVoiceReport(input: {
  recordedAtIso: string;
  userAgent: string;
  draft: VoiceDraft;
}): string {
  const comment = input.draft.comment.replace(/\s+/g, ' ').trim();
  const heard =
    input.draft.heard.length > 0 ? input.draft.heard.map((file) => `- ${file}`).join('\n') : '(none)';
  return [
    'Sawti P0.5 voice-spike rating (anonymous, local only, not submitted)',
    `recordedAt: ${input.recordedAtIso}`,
    `userAgent: ${input.userAgent}`,
    `role: ${input.draft.role || '(none)'}`,
    `salmaScore: ${scoreText(input.draft.salma)}`,
    `shakirScore: ${scoreText(input.draft.shakir)}`,
    `comment: ${comment || '(none)'}`,
    'heard:',
    heard,
    'decision: not chosen here; Mahmoud picks the v1.0 voice later',
    'childData: none',
    '',
  ].join('\n');
}

function scoreOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) return null;
  return value;
}

function scoreText(score: number | null): string {
  return score === null ? '(none)' : String(score);
}

function heardOrEmpty(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const files: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && HEARD_FILE.test(item) && !files.includes(item)) files.push(item);
    if (files.length === 200) break;
  }
  return files;
}
