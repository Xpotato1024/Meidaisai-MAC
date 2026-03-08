# デプロイフロー

## 現在の状態

2026-03-09 時点:

- GitHub repository variables は設定済み
- `FIREBASE_SERVICE_ACCOUNT` は設定済み
- GitHub Actions から Firebase Hosting へ deploy 可能

## 目的

Firebase Hosting の標準 deploy 経路を GitHub Actions に統一します。  
ローカルや `code-server` からの手動 deploy は補助経路としてのみ扱います。

## 初回セットアップ

### 1. ローカル開発設定

端末ごとに次を実施します。

1. `.env.example` を `.env` にコピーする
2. Firebase Web 設定とアプリ用の値を記入する
3. `python3 scripts/generate_local_config.py` を実行する

生成されるファイル:

- `.firebaserc`
- `public/js/env.js`

どちらもローカル専用で、commit しません。

### 2. GitHub Actions Variables

対象 repository: `Xpotato1024/Meidaisai-MAC`

登録する Variables:

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

CLI 例:

```bash
gh variable set -R Xpotato1024/Meidaisai-MAC -f .env
```

### 3. GitHub Actions Secret

必須 Secret:

- `FIREBASE_SERVICE_ACCOUNT`

推奨手順:

1. 信頼できる端末に Firebase CLI を入れる
2. `firebase login` を実行する
3. この repository で `firebase init hosting:github` を 1 回だけ実行する
4. Firebase に GitHub deploy 用 credential を作らせる
5. workflow ファイル差分が不要なら、その差分だけを戻して Secret は残す

手動で登録する場合:

1. 対象プロジェクト用の service account を作成する
2. JSON key を発行する
3. その JSON を GitHub Secret `FIREBASE_SERVICE_ACCOUNT` として登録する

CLI 例:

```bash
gh secret set FIREBASE_SERVICE_ACCOUNT -R Xpotato1024/Meidaisai-MAC < service-account.json
```

## 標準リリースフロー

### 開発時

1. feature branch を作成する
2. コードとドキュメントを一緒に更新する
3. `.env` を変更した場合は `python3 scripts/generate_local_config.py` を再実行する
4. `npm run check` と必要なローカル確認を行う
5. branch を push して Pull Request を作成する

### Pull Request 時

PR ごとに次が走ります。

- `Validate Local Config`
- `Deploy Preview to Firebase Hosting`

preview deploy は fork ではない PR を対象にします。

### 本番反映

1. PR を `main` へ merge する
2. `Validate Local Config` が `main` で実行される
3. `Deploy Live to Firebase Hosting` が `main` で実行される
4. Firebase Hosting の本番が更新される

## rollback

基本の rollback 手順:

1. `main` に入った不具合 commit を revert する
2. revert commit を push する
3. live deploy workflow に差し戻した状態を再配信させる

## 手動 deploy

手動 deploy は標準経路ではありません。  
一時確認や緊急対応に限って使います。

基本手順:

1. Firebase CLI を用意する
2. `firebase login` を実行する
3. `.env` を確認する
4. `python3 scripts/generate_local_config.py` を実行する
5. `npm run build` を実行する
6. `firebase deploy --only hosting --project <project-id>` を実行する

`code-server` を使う手動 deploy 案は [../roadmap.md](../roadmap.md) で別管理しています。
