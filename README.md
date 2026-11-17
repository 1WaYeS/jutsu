# JUTSU — Your Voice Is Your Power

A mobile-first university accessibility prototype that turns a small set of camera gestures into readable English and optional speech.

## Features

- Live camera input, rear/front switching, fullscreen and accessible text.
- Experimental isolated gestures: HELLO (informal wave), YES, NO, MORE, YOU.
- Text always visible, optional speech and manual replay.
- ASL dictionary with clear camera-enabled versus reference-only entries.
- Separate Train AI lab for local recording, training, and evaluation.
- Explicitly saved message history on the user's device.

This is not a validated continuous ASL translator. Hand tracking uses MediaPipe; the main vocabulary uses temporal movement rules. Unsupported or ambiguous movements must not be presented as recognized sentences. MORE and YOU require live evaluation. The personalized lab has a separate screening gate.

## Run locally

Requires Node.js 22.

```sh
npm ci
npm run build
npm start
```

Open http://127.0.0.1:5180. Camera access requires HTTPS except on localhost.

```sh
npm run check
npm test
```

## GitHub Pages

The Actions workflow builds, checks, and deploys automatically on pushes to main. The Pages build adapts asset URLs, workers, navigation, and directory routes to this repository's project path. It publishes only pages-dist. No backend is needed for the main camera, training lab, browser speech, or local history.

Enable GitHub Pages with GitHub Actions as its publishing source. The public HTTPS site can request camera access on compatible mobile browsers. Performance and speech voice availability depend on the device.

## Privacy

Camera processing is local. This repository excludes private recordings, personal datasets, evaluation checkouts, local backups, and secrets. Saved samples and messages stay in the browser where they were created. GitHub Pages has a different origin from localhost; existing local recordings are not automatically transferred.

## Attribution

See THIRD_PARTY_NOTICES.md and vendor/GestureSign/LICENSE. The experimental pretrained checkpoint and replay fixtures retain their upstream/data attribution; they are not the main gesture recognizer. ASL references link to ASL University / Lifeprint. Branding/reference artwork was supplied for this project; generated alternative artwork is decorative, not signing instruction.

The separately evaluated ISL-avatar project is not included. No Meeting Mode is enabled.
