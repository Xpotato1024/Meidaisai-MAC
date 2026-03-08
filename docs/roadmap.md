# Roadmap

## Current priority

1. Publish the clean public repository as `Meidaisai-MAC`.
2. Migrate the sanitized app into the new repository.
3. Verify the first end-to-end Firebase Hosting deploy from GitHub Actions.

## Deferred

### code-server manual deploy path

This is intentionally low priority.
The primary release path is GitHub Actions based CI/CD.

Revisit this only after the public repository and the standard Firebase deploy flow are stable.

Planned work:

1. Add `firebase-tools` to the Home `code-server` image through the `Home-Servers` repository.
2. Decide whether manual deploy is allowed for staging only or also for break-glass production use.
3. Add a short runbook for authentication, config generation, and rollback.
