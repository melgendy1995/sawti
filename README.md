# Sawti (صوتي)

Free charity AAC (augmentative and alternative communication) app for Egyptian Arabic and Saudi Arabic. It is a Progressive Web App and an Android APK. Speech and boards work offline after the app shell is installed.

This repository is **private** until the owner decides otherwise (plan question Q1). The code in this repository is under the [Apache License 2.0](LICENSE). Copyright 2026 Mahmoud Elgendy.

Planning notes live outside this repo, in `~/brainstorm/sawti/`. They are not copied here.

## Layout

| Path | What it is |
|---|---|
| `app/` | Angular PWA and Capacitor Android project |
| `site/` | Landing page copied to the site root |
| `content/` | Pack and board content (empty; assets are not committed yet) |
| `docs/` | Notes for this repo |
| `tools/` | Maintainer tools (empty) |
| `infra/` | Server compose and host config (empty; API is backlog) |
| `scripts/build-pages.sh` | Builds the Pages directory. Does not deploy |
| `api/` | Empty backlog marker. No API in this tree |

## Prerequisites

Local Node is Homebrew Node (currently 26). CI uses **Node 22 LTS**. Either can install and build `app/`. Do not install a second Node just to match CI.

From `app/`, `npm ci` installs the Angular CLI used by the npm scripts.

Android Gradle (not run in CI):

- JDK 21: `JAVA_HOME=/opt/homebrew/opt/openjdk@21` (Homebrew OpenJDK 26 is too new for the Gradle wrapper)
- Android SDK: `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`

## Local commands

```bash
cd app
npm ci
npm run lint
npm run stylelint
npm test          # Vitest via ng test. Do not pass --browsers=ChromeHeadless.
npm run build     # production, base href /, budgets on (Capacitor webDir)
```

Pages output, from the repo root (no deploy):

```bash
scripts/build-pages.sh
```

That script builds the Angular app again with `--base-href /app/` into `app/dist/pages-browser`, then writes:

| Output | Served as |
|---|---|
| `site/` | `dist/pages/` → `/` |
| Angular browser build | `dist/pages/app/` → `/app/` |
| `site/_headers` | `dist/pages/_headers` |

`wrangler.toml` only sets `pages_build_output_dir = "dist/pages"`. There is no Cloudflare account, token, or deploy job.

`npm run build` (base href `/`) is the build to sync into the Android WebView. `scripts/build-pages.sh` is only for the Pages tree. CI does not run Gradle or `cap sync`.

## CI

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`: `npm ci`, lint, stylelint, Vitest, production `ng build`, the Pages script, a check that `ngsw.json` does not list `/packs/`, and Gitleaks. Playwright is not configured (`app/e2e/` is a placeholder). The content license gate lands with P1.5.

GitHub settings that this repo does not configure from a workflow: branch protection, secret scanning, push protection, and whether CodeQL is allowed on a private free-plan repository.
