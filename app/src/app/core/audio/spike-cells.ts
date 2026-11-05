export interface SpikeCell {
  id: string;
  /** Display text only. The MP3 is a sine tone, not speech. */
  label: string;
  file: string;
}

export const SPIKE_CELLS: readonly SpikeCell[] = [
  { id: '01', label: 'ماء', file: '01.mp3' },
  { id: '02', label: 'أكل', file: '02.mp3' },
  { id: '03', label: 'مدرسة', file: '03.mp3' },
  { id: '04', label: 'بيت', file: '04.mp3' },
  { id: '05', label: 'ماما', file: '05.mp3' },
  { id: '06', label: 'بابا', file: '06.mp3' },
  { id: '07', label: 'نعم', file: '07.mp3' },
  { id: '08', label: 'لا', file: '08.mp3' },
  { id: '09', label: 'حمام', file: '09.mp3' },
  { id: '10', label: 'مساعدة', file: '10.mp3' },
  { id: '11', label: 'ألم', file: '11.mp3' },
  { id: '12', label: 'نوم', file: '12.mp3' },
  { id: '13', label: 'لعب', file: '13.mp3' },
  { id: '14', label: 'كتاب', file: '14.mp3' },
  { id: '15', label: 'حليب', file: '15.mp3' },
  { id: '16', label: 'سيارة', file: '16.mp3' },
  { id: '17', label: 'خارج', file: '17.mp3' },
  { id: '18', label: 'داخل', file: '18.mp3' },
  { id: '19', label: 'مرحبا', file: '19.mp3' },
  { id: '20', label: 'شكرا', file: '20.mp3' },
];

export const DIAGNOSTIC_CELL: SpikeCell = SPIKE_CELLS[0];

/**
 * Resolve a clip against the document base so `/` (Capacitor, ng serve) and
 * `/app/` (Pages) both work. The file name is a bare asset name: spike clips
 * must stay out of `/packs/` (E5).
 */
export function spikeClipUrl(file: string, baseUri: string): string {
  if (file.length === 0 || file.includes('/') || file.includes('\\') || file.includes('..')) {
    throw new Error('clip file must be a bare name');
  }
  return new URL(`spike-clips/${file}`, baseUri).toString();
}
