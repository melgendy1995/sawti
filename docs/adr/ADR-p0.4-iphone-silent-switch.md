# ADR: iPhone silent switch (P0.4)

Status: draft. Device results below are empty until Mahmoud fills them from `docs/p0.4-device-checklist.md`.

## Context

Plan v1.0 §2.8 (kept by v1.1), risk R-07: a user gesture must resume `AudioContext`. Web Audio on iPhone can stay muted while the hardware silent switch is on, and `AudioContext.state` can still be `running`. Silence with no on-screen warning is Sev-0.

`navigator.audioSession` is an iOS API. Android and desktop browsers do not have it. This spike does not add a dependency or a type package for it. The local types live in `app/src/app/core/audio/playback-session.ts`.

P1.8 (caregiver recordings, Azure, native TTS) is out of scope. A missing spike clip still has to show text (INV-6).

## Decision

`AudioEngine` (`app/src/app/core/audio/audio-engine.ts`) owns one `AudioContext`.

- Before `new AudioContext()`, and again on each gesture and when the page returns, `requestPlaybackSession` sets `navigator.audioSession.type = 'playback'` when that object exists and `type` is a string. A `DOMException` is reported as `applied: false` and does not throw into the tap. A missing API returns `supported: false`.
- The first `pointerdown` or `keydown` (capture on `document`) resumes a `suspended` context. `visibilitychange` and `pageshow` call `contextNeedsResume`: resume only when the page is visible and the state is `suspended`.
- `warningsForPlayback` (`hearing-warnings.ts`) is the silence rule. It returns bilingual Arabic and English for a missing or undecoded clip, a `start()` failure, or a context that is still not `running` after resume settles. Until the caregiver chooses "I hear sound", the page shows "هل تسمع الصوت؟". "لا أسمع شيئاً" shows "لا يوجد صوت. تحقق من مفتاح الصامت في الآيفون." The two buttons stay on screen after a confirmation, so a later mute still has a control and a line of instructions.
- Each cell keeps its Arabic label. A clip that failed to decode also shows "لا صوت / No voice". The tap path does not fetch.

There is no hardware listener for the silent switch. The app cannot know the switch position. The warning is the caregiver's answer plus the non-running and missing-clip alerts.

## What CI cannot verify

Vitest and a headless browser do not flip the iPhone silent switch, route audio through the ringer, or measure sound at the ear. `npm test` covers the decision helpers only: nearest-rank p50/p95, the copyable report, `audioSession` present/absent/refused, and that every silent-risk input gets bilingual warning text. Playwright is not configured. A green CI run does not mean the silent switch plays, and it does not mean p95 ≤ 150 ms on a phone.

`baseLatency` / `outputLatency` and the 30-tap meter are in-browser time from `pointerup` to `AudioBufferSourceNode.start()`. They are not acoustic latency. The checklist says to treat a phone-camera check as separate.

Bluetooth disconnect (plan §5.10) is not implemented. Only `visibilitychange` and `pageshow` retry `resume()`.

## Device results

Leave this section for Mahmoud. Paste the copied diagnostics report under the table. Do not mark a row from CI.

| Check | D1 iPhone | Budget Android | Date | Notes |
|---|---|---|---|---|
| Silent switch on: audio plays? |  |  |  |  |
| If muted: warning visible? (Sev-0 if silent and no warning) |  |  |  |  |
| Silent switch off: audio plays? |  |  |  |  |
| JS p95 ≤ 150 ms (diagnostics verdict) |  |  |  |  |
| After background / lock / return |  |  |  |  |
| `audioSession` line from the report |  |  |  |  |

Pasted report:

```
```
