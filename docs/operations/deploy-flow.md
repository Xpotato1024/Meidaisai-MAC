# Deployment Flow

## Status

As of 2026-03-09:

- GitHub repository variables for Firebase Hosting are configured.
- `FIREBASE_SERVICE_ACCOUNT` is configured.
- Deploy workflows are active and can publish to Firebase Hosting.

## Goal

Use GitHub Actions as the standard deployment path for Firebase Hosting.
Keep local manual deploys as a secondary option only.

## One-time setup

### 1. Local development config

For each device:

1. Copy `.env.example` to `.env`.
2. Fill in the Firebase web config and app values.
3. Run `python3 scripts/generate_local_config.py`.

This generates:

- `.firebaserc`
- `public/js/env.js`

Both files stay local and must not be committed.

### 2. GitHub Actions repository variables

Repository: `Xpotato1024/Meidaisai-MAC`

Variables:

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

CLI example:

```bash
gh variable set -R Xpotato1024/Meidaisai-MAC -f .env
```

### 3. GitHub Actions secret

Required secret:

- `FIREBASE_SERVICE_ACCOUNT`

Recommended path:

1. Install Firebase CLI on a trusted machine.
2. Run `firebase login`.
3. Run `firebase init hosting:github` in this repository once.
4. Let Firebase create the GitHub deploy credential.
5. If the command rewrites workflow files unnecessarily, discard only those workflow changes and keep the GitHub secret.

Alternative path:

1. Create a Google Cloud service account for project `line-omega`.
2. Create a JSON key for that service account.
3. Store that JSON in GitHub as `FIREBASE_SERVICE_ACCOUNT`.

CLI example:

```bash
gh secret set FIREBASE_SERVICE_ACCOUNT -R Xpotato1024/Meidaisai-MAC < service-account.json
```

## Standard release flow

### Feature work

1. Create a feature branch.
2. Update code and docs together.
3. Regenerate local config if `.env` changed.
4. Verify the app locally.
5. Push the branch and open a pull request.

### Pull request

On every PR:

- `Validate Local Config` runs.
- `Deploy Preview to Firebase Hosting` runs for non-fork pull requests.

### Production release

1. Merge the PR into `main`.
2. `Validate Local Config` runs on `main`.
3. `Deploy Live to Firebase Hosting` runs on `main`.
4. Firebase Hosting live is updated from GitHub Actions.

## Rollback

Primary rollback method:

1. Revert the bad commit on `main`.
2. Push the revert commit.
3. Let the live deploy workflow publish the reverted state.

## Manual deploy

Manual deploy is not the standard path.
Use it only for temporary verification or break-glass operations.

Basic flow:

1. Install Firebase CLI.
2. Run `firebase login`.
3. Ensure `.env` is correct.
4. Run `python3 scripts/generate_local_config.py`.
5. Run `firebase deploy --only hosting --project line-omega`.

The `code-server` based manual deploy option is tracked separately in `docs/roadmap.md`.
