/** True when this URL is the speak screen, including the empty redirect that lands on it. */
export function isSpeakUrl(url: string | null | undefined): boolean {
  if (url == null) {
    return true;
  }
  const path = url.split(/[?#]/, 1)[0] ?? '';
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed === '' || trimmed === '/' || trimmed === '/speak';
}
