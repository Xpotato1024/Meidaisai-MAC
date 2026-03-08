# AGENTS.md

## Scope
- This directory is the root for application repositories under /workspace/apps.
- Infrastructure source of truth is /workspace/Home-Servers.

## Working Rules
- Use WSL tools (git, gh, docker, docker compose).
- Use feature branches and Pull Requests; do not push directly to main.
- Keep secrets out of repositories (.env, keys, tokens, passwords).

## 言語ポリシー
- PRタイトル/本文、コミットメッセージ、ドキュメント更新は日本語で記述する。
- コード識別子、コマンド名、ファイルパス、プロダクト名は正確性を優先して原文のままでよい。

## Release Flow
1. Implement and test in each app repository.
2. Build and publish immutable image tag or digest.
3. Open a PR in Home-Servers to update deployment references.
4. Deploy via Home-Servers workflows (staging then production).

## Boundary
- App source belongs in /workspace/apps/<app-repo>.
- Runtime or infrastructure changes belong in /workspace/Home-Servers.
