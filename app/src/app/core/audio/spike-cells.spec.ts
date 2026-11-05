import { SPIKE_CELLS, spikeClipUrl } from './spike-cells';

describe('spike clip urls', () => {
  it('serves twenty bare tones from spike-clips under the document base', () => {
    expect(SPIKE_CELLS).toHaveLength(20);
    expect(new Set(SPIKE_CELLS.map((cell) => cell.id)).size).toBe(20);

    for (const cell of SPIKE_CELLS) {
      expect(cell.label).toMatch(/\p{Script=Arabic}/u);
      const atRoot = new URL(spikeClipUrl(cell.file, 'https://phone.example/'));
      const underApp = new URL(spikeClipUrl(cell.file, 'https://phone.example/app/'));
      expect(atRoot.pathname).toBe(`/spike-clips/${cell.file}`);
      expect(underApp.pathname).toBe(`/app/spike-clips/${cell.file}`);
      expect(atRoot.pathname.includes('/packs/')).toBe(false);
      expect(underApp.pathname.includes('/packs/')).toBe(false);
    }
  });

  it('rejects a file name that could leave spike-clips', () => {
    expect(() => spikeClipUrl('../packs/x.mp3', 'https://phone.example/')).toThrow(Error);
    expect(() => spikeClipUrl('nested/x.mp3', 'https://phone.example/')).toThrow(Error);
  });
});
