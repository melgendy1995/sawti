# ADR-02: MediaStore and iOS PWA blob storage (P0.6)

Status: draft. Device results below are empty until Mahmoud fills them from `docs/p0.6-device-checklist.md`. Default policy stands until then.

## Context

Plan v1.1 decision 14 / §3.1, risk R-02: a Home Screen PWA on iOS can lose its data. WebKit has shipped IndexedDB blob bugs, the OS can evict under disk pressure, and the user can delete the Home Screen icon (which deletes the app's data). Media (photos, recordings) is the large, irreplaceable part, so where it lives has to be chosen from evidence, not assumption.

Plan v1.1 §2.8 storage facts to verify on device:

- Home Screen storage is separate from Safari tabs.
- Deleting the Home Screen icon deletes the data.
- The 7-day Safari script-storage deletion does not apply to Home Screen apps.
- Eviction under disk pressure is still possible.

Structured data (boards, vocab) will live in Dexie/IndexedDB later. This ADR is only about where **media blobs** go.

## Decision

Media sits behind a `MediaStore` interface (`app/src/app/core/storage/`) with two web backends and a runtime self-test:

- **`IndexedDbMediaStore`** (`backend: 'idb'`) — stores `Blob` objects directly in IndexedDB (one DB `sawti-soak-idb`, one object store keyed by chunk id). Storing blobs, not ArrayBuffers, is deliberate: that is exactly the WebKit path R-02 is about.
- **`OpfsMediaStore`** (`backend: 'opfs'`) — one file per key inside a private `sawti-soak-opfs` directory from `navigator.storage.getDirectory()`.
- **`selfTest(store, key, bytes)`** — write bytes, read them back, SHA-256 compare. A backend that fails is not trusted for media.

`NativeMediaStore` (Capacitor Filesystem) is **not** part of this spike (plan §3.1).

**Default policy (until device results say otherwise): IndexedDB blobs on web, fall back to OPFS if this soak or the runtime self-test shows IDB blobs unreliable on iOS.**

### The soak (what the test page does)

The P0.6 page at `/storage` (lazy route):

1. Logs `navigator.storage.persist()`, `persisted()`, and `estimate()` (usage/quota).
2. Writes ~200 MB as 20 × 10 MiB deterministic xorshift chunks (generated on device at runtime, never committed, not media of any person), SHA-256 each, stores blob + hash. A `manifest.json` key holds the hashes so a later session can verify without rewriting.
3. Re-reads every chunk, re-hashes, compares to the stored hash — pass/fail per chunk and a summary.
4. Repeats the whole flow against OPFS.
5. Keeps results across reload: "Load existing" + "Verify" work after a reboot and after 14 days with no rewrite.
6. Emits a copyable report (timestamp, userAgent, display-mode standalone, persist/estimate, backend, chunk count/bytes, hash-of-hashes, verify results, errors).
7. `QuotaExceededError` is shown, not thrown: the write stops and keeps what it got, so a low-disk phone is not bricked by a retry.

## Acceptance

All hashes match after the write, after a reboot, and after 14 days unopened — **or** MediaStore defaults to OPFS on iOS and OPFS passes the same test. Plus: deleting the Home Screen icon deletes the data (confirmed on device).

## What CI cannot verify

Vitest/jsdom have no IndexedDB and no OPFS, and never write 200 MB. `npm test` covers only the pure logic on tiny (few-KB) fixtures: the SHA-256 helper against FIPS vectors, the report/verify summary shape, deterministic chunk generation, and the self-test write→read→compare path with an in-memory fake store. A green CI run does **not** prove iOS keeps the data across a reboot or 14 days, and does **not** prove OPFS behaves. Those are the device rows below.

## Device results

Leave this section for Mahmoud. Paste the copied report under the tables. Do not mark a row from CI. Use two iPhones (label them P1, P2) and record iOS versions.

### Environment and persist()

| iPhone | iOS version | display-mode standalone | navigator.standalone | persist() granted | persisted() | quota (estimate) | Date |
|---|---|---|---|---|---|---|---|
| P1 |  |  |  |  |  |  |  |
| P2 |  |  |  |  |  |  |  |

### IndexedDB backend (`idb`) — 200 MB

| iPhone | write verify (immediate) | after reboot | after 14 days | QuotaExceeded? | hashOfHashes | Notes |
|---|---|---|---|---|---|---|
| P1 |  |  |  |  |  |  |
| P2 |  |  |  |  |  |  |

### OPFS backend (`opfs`) — 200 MB

| iPhone | write verify (immediate) | after reboot | after 14 days | QuotaExceeded? | hashOfHashes | Notes |
|---|---|---|---|---|---|---|
| P1 |  |  |  |  |  |  |
| P2 |  |  |  |  |  |  |

### Storage facts (plan §2.8)

| Check | P1 | P2 | Notes |
|---|---|---|---|
| Safari tab and Home Screen app share storage? (expect: no) |  |  |  |
| Delete Home Screen icon → data gone after re-add? (expect: yes) |  |  |  |
| Data survived with app unopened 14 days? (7-day rule should not apply) |  |  |  |
| Any eviction observed under disk pressure? |  |  |  |

### Outcome / policy decision

Fill once results are in. Keep the default (IDB blobs, OPFS fallback) unless IDB failed where OPFS passed, in which case default to OPFS on iOS.

Pasted reports:

```
```
