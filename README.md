# Meidaisai-MAC

This repo is the public-ready Firebase Hosting version of the Meidaisai MAC lane management app.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in the Firebase web config, `APP_ID`, and `ADMIN_PASSWORD`.
3. Run `python3 scripts/generate_local_config.py`.
4. Serve `public/` or deploy with the Firebase CLI.

The script generates these local-only files:

- `public/js/env.js`
- `.firebaserc`

Both files are gitignored and should stay out of commits.

## Roadmap

See `docs/roadmap.md` for the current release priorities and deferred operations work.

## Multi-device development

Use a separate Firebase project for each environment like `dev`, `staging`, and `prod`.
Firebase recommends separate Firebase projects for workflow environments instead of multiple Hosting sites in one project.

For each device:

1. Copy `.env.example` to `.env`.
2. Set the Firebase project values for the environment you want to use on that device.
3. Run `python3 scripts/generate_local_config.py`.
4. Deploy manually only when you need to test from that device.

If you want to keep multiple local env files on one device, you can run:

- `python3 scripts/generate_local_config.py --env-file .env.dev`
- `python3 scripts/generate_local_config.py --env-file .env.prod`

Only `.env.example` should be committed. Keep `.env`, `.firebaserc`, and `public/js/env.js` local.

## CI/CD

This repo includes three GitHub Actions workflows:

- `.github/workflows/validate-local-config.yml`
- `.github/workflows/firebase-hosting-preview.yml`
- `.github/workflows/firebase-hosting-live.yml`

Set these GitHub repository Variables:

- `APP_ID`
- `ADMIN_PASSWORD`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_PROJECT_ALIAS`

Set this GitHub repository Secret:

- `FIREBASE_SERVICE_ACCOUNT`

These settings are only required when you want GitHub Actions to deploy to Firebase Hosting.
Until they are configured, the preview and live deploy workflows will skip cleanly.

The preview workflow deploys PR previews for non-fork pull requests.
The live workflow deploys to Firebase Hosting on pushes to `master` or `main`.

The Firebase Hosting docs say `firebase init hosting:github` can create the service account secret and workflow files automatically.

## Security note

`ADMIN_PASSWORD` is still sent to the browser because this app is a static frontend.
Treat it as a UI guard against accidental operation, not as real security.

If you need real admin-only access, move admin authentication to Firebase Auth or another server-side check and enforce it with Firestore rules.
