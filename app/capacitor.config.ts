import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell for Sawti. applicationId is a placeholder until Q3.
 * webDir matches the Angular application builder output.
 * Default production `ng build` uses base href `/` so the WebView (which
 * hosts webDir at `/`) can load scripts. Cloudflare Pages output is built
 * separately by scripts/build-pages.sh with `--base-href /app/`.
 */
const config: CapacitorConfig = {
  appId: 'app.sawti',
  appName: 'صوتي',
  webDir: 'dist/sawti/browser',
};

export default config;
