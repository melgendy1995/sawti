import { spikeClipUrl } from './spike-cells';

export class ClipDecodeError extends Error {
  readonly clipId: string;

  constructor(clipId: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ClipDecodeError';
    this.clipId = clipId;
  }
}

/** Fetch and decode one spike clip. Throws ClipDecodeError when the clip cannot be used. */
export async function decodeSpikeClip(
  context: BaseAudioContext,
  clipId: string,
  url: string,
): Promise<AudioBuffer> {
  const response = await fetchClip(url, clipId);
  const bytes = await response.arrayBuffer();
  try {
    return await context.decodeAudioData(bytes);
  } catch (error) {
    if (error instanceof DOMException) {
      throw new ClipDecodeError(clipId, `decode failed for ${clipId}`, { cause: error });
    }
    throw error;
  }
}

export function clipUrlFor(file: string): string {
  return spikeClipUrl(file, document.baseURI);
}

async function fetchClip(url: string, clipId: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new ClipDecodeError(clipId, `fetch failed for ${clipId}`, { cause: error });
    }
    throw error;
  }
  if (!response.ok) {
    throw new ClipDecodeError(clipId, `HTTP ${response.status} for ${clipId}`);
  }
  return response;
}
