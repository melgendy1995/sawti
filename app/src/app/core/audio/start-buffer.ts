/** Play an already-decoded buffer. The call to start() is the end of the tap-to-start clock. */
export function startBuffer(context: AudioContext, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => source.disconnect();
  source.start();
}
