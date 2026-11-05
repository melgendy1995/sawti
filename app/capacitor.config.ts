import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell for Sawti. applicationId is a placeholder until Q3.
 * webDir matches the Angular application builder output.
 * Production `baseHref` is `/app/` for Cloudflare Pages. The WebView hosts
 * this folder at `/`, so a debug APK needs a later build configuration with
 * base href `/` (see docs/p0.3-notes.md).
 */
const config: CapacitorConfig = {
  appId: 'app.sawti',
  appName: 'Sawti',
  webDir: 'dist/sawti/browser',
};

export default config;
