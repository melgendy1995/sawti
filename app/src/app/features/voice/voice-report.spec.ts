import { clipName } from './voice-sample';
import { VOICE_DRAFT_KEY, formatVoiceReport, parseDraft } from './voice-report';

describe('voice-spike report', () => {
  it('names clips the same way as the render script', () => {
    expect(clipName('want', 'm', 'ar-EG-SalmaNeural')).toBe('want.m.ar-EG-SalmaNeural.mp3');
    expect(clipName('friend', 'f', 'ar-EG-ShakirNeural')).toBe('friend.f.ar-EG-ShakirNeural.mp3');
  });

  it('keeps scores and refuses child fields in the pasted report', () => {
    const draft = parseDraft(
      JSON.stringify({
        role: 'SLP',
        salma: 4,
        shakir: 5,
        comment: 'سلمى أوضح\nفي الجملة',
        heard: ['want.m.ar-EG-SalmaNeural.mp3', 'not a file', 'want.m.ar-EG-SalmaNeural.mp3'],
        childName: 'must-not-appear',
        age: 7,
        school: 'must-not-appear',
      }),
    );
    const report = formatVoiceReport({
      recordedAtIso: '2026-11-05T12:00:00.000Z',
      userAgent: 'test-agent',
      draft,
    });

    expect(VOICE_DRAFT_KEY).toBe('sawti.voice-spike.draft.v1');
    expect(draft.role).toBe('SLP');
    expect(draft.heard).toEqual(['want.m.ar-EG-SalmaNeural.mp3']);
    expect(report).toContain('recordedAt: 2026-11-05T12:00:00.000Z');
    expect(report).toContain('userAgent: test-agent');
    expect(report).toContain('salmaScore: 4');
    expect(report).toContain('shakirScore: 5');
    expect(report).toContain('comment: سلمى أوضح في الجملة');
    expect(report).toContain('decision: not chosen here; Mahmoud picks the v1.0 voice later');
    expect(report).toContain('childData: none');
    expect(report).not.toContain('must-not-appear');
    expect(report).not.toContain('winner');
  });

  it('drops out-of-range scores and unknown roles', () => {
    const draft = parseDraft(JSON.stringify({ role: 'child', salma: 9, shakir: 3, comment: 'صوت' }));
    expect(draft.role).toBe('');
    expect(draft.salma).toBeNull();
    expect(draft.shakir).toBe(3);
  });
});
