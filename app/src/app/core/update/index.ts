export { clearBlockingNotice, showBlockingNotice } from './notice-host';
export type { BlockingNotice } from './notice-host';
export { APP_RELOAD } from './reload';
export { isSpeakUrl } from './speak-route';
export { provideSawtiUpdates } from './update.providers';
export { UpdateService } from './update.service';
export { VersionCheck } from './version-check';
export type { VersionCheckResult, VersionCheckStatus } from './version-check';
export { httpsUrl, parseVersionDocument } from './version-document';
export type { VersionDocument } from './version-document';
export {
  APP_VERSION_CODE,
  VERSION_CHECK_INTERVAL_MS,
  VERSION_CHECK_STAMP_KEY,
  VERSION_JSON_URL,
  VERSION_STAMP_STORE,
} from './version.tokens';
export type { VersionStampStore } from './version.tokens';
