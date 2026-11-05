// core/storage — MediaStore backends for the P0.6 iOS storage soak.
// See ADR-02 (docs/adr/ADR-02-mediastore-ios-blobs.md).

export type { MediaStore, MediaBackend, SelfTestResult } from './media-store';
export { selfTest, errorText } from './media-store';
export { IndexedDbMediaStore } from './idb-media-store';
export { OpfsMediaStore } from './opfs-media-store';
export { sha256Hex, hashOfHashes, hashesMatch, bytesToHex } from './sha256';
export {
  defaultSoakPlan,
  makePlan,
  makeChunk,
  chunkKey,
  type SoakPlan,
} from './soak-chunks';
export {
  summarizeVerify,
  formatSoakReport,
  type ChunkRecord,
  type SoakManifest,
  type ChunkVerify,
  type VerifySummary,
  type SoakReportInput,
} from './soak-report';
