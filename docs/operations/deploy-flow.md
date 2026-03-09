# デプロイフロー

## 現在の状態

2026-03-09 時点:

- GitHub repository variables は設定済み
- `FIREBASE_SERVICE_ACCOUNT` は設定済み
- GitHub Actions から Firebase Hosting と Firestore Rules へ deploy 可能

## 目的

Firebase Hosting と Firestore Rules の標準 deploy 経路を GitHub Actions に統一します。  
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

`ADMIN_PASSWORD` は任意です。残す場合だけ Variables に追加してください。

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

### 4. Firebase Authentication

Google ログインを使うため、Firebase Console で Authentication を有効化します。

1. Firebase Console を開く
2. `Authentication`
3. `Sign-in method`
4. `Google` を有効化する

### 5. 初期管理者の bootstrap

最初の `admin` だけは Firebase Console から手動登録します。
これは `app_id` ごとではなく、原則 1 回だけです。
Firestore Console で `/sys_globalAccessMembers/{uid}` を作成し、以下を入れます。

```json
{
  "uid": "ログイン済みユーザーの uid",
  "email": "example@gmail.com",
  "displayName": "表示名",
  "role": "admin",
  "isActive": true,
  "assignedRoomIds": [],
  "authorizationSource": "global"
}
```

初回管理者を入れた後は、どの `app_id` に切り替えても管理画面へ入り、アプリ内の「メンバー権限管理」から承認・更新を行えます。

### 6. 年度名簿の取り込み

このアプリの名簿正本は Google スプレッドシートを想定します。
運用時はスプレッドシートを直接参照せず、CSV をアプリへ取り込みます。

1. Google スプレッドシートで今年度名簿を更新する
2. `名前`, `Gmail`, `学年` の列を含んだ CSV を出力する
3. 初期 `admin` でアプリへログインする
4. 管理設定の「名簿インポート」から CSV を取り込む
5. 一般メンバーはログイン時に自動承認される
6. role と担当部屋は管理画面で後付けする

補足:

- 名簿外の技術者や dev 用アカウントは CSV に含めず、承認待ちから手動承認する
- 年度更新時に名簿から外れた `roster` 由来メンバーは自動で無効化される
- `有効/無効` 列は CSV に含めない

## 運用上の注意

- 受付画面は `roomState` の部屋サマリをリアルタイム購読し、案内操作時だけ対象部屋のレーン一覧を取得する
- `staff` は担当部屋だけを購読する
- 待機組数は transaction で更新するため、同時操作時も単純上書きされにくい
- レーン更新は `revision` を進めながら Firestore 上の最新値に対して行う
- `roomState` は待機組数だけでなく、空き/案内中/使用中/準備中/休止中の件数も保持する

この前提が崩れると read/write の見積もりが変わるため、運用中に Firestore ドキュメント構造を直接変える場合は注意してください。

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
4. Firestore Rules / Indexes が更新される
5. Firebase Hosting の本番が更新される

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
6. `firebase deploy --only firestore:rules,firestore:indexes,hosting --project <project-id>` を実行する

`code-server` を使う手動 deploy 案は [../roadmap.md](../roadmap.md) で別管理しています。
