/** One voice from `speechSynthesis.getVoices()`, narrowed so tests can fake it. */
export interface DeviceVoice {
  readonly voiceURI: string;
  readonly name: string;
  readonly lang: string;
  readonly localService: boolean;
  readonly default: boolean;
}
