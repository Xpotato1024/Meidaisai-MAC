# ロードマップ

## 現在の優先事項

1. 公開用 repository `Meidaisai-MAC` を安定運用できる状態に保つ
2. Google ログイン + Firestore Rules の権限モデルを安定運用に乗せる
3. TypeScript 化したフロントエンド分割を定着させる
4. Firebase Hosting / Firestore deploy を GitHub Actions 経由で継続的に回す

## 継続改善

### フロントエンド整理

- `src/` を編集起点に統一する
- `render` / `events` / `writes` / `firestore` の責務境界を崩さない
- 元コードのコメントや意図は可能な限り保持する
- 必要になった時点で型をさらに厳格化する

### 認証と権限

- Firebase Auth と Firestore Rules の role モデルを維持する
- 初期管理者 bootstrap の手順を簡略化する
- 承認依頼時のメモ、所属、担当希望を request に持たせるか検討する
- 秘匿が必要な設定は引き続き `.env` と GitHub Secrets に閉じ込める

### コストとパフォーマンス

- `staff` の購読範囲を担当部屋単位に保つ
- 不要 write の抑制を続ける
- 必要なら監視対象をイベント開催日単位で分割する
- 監査ログを Firestore 本体から分離するか検討する

## 後回しにしている項目

### code-server からの手動 deploy 経路

この項目は意図的に低優先です。  
標準の公開経路は GitHub Actions ベースの CI/CD とします。

公開 repository と通常の Firebase deploy フローが十分に安定してから再検討します。

予定している作業:

1. `Home-Servers` repository 側で Home 用 `code-server` イメージに `firebase-tools` を追加する
2. 手動 deploy を staging 限定にするか、緊急時の本番操作まで許可するかを決める
3. 認証、設定生成、rollback をまとめた短い runbook を追加する

### Next.js の導入

現時点では不要です。  
静的配信だけで足りているため、SSR や API Routes が必要になるまで導入しません。

再検討の条件:

1. サーバー側で権限判定したい
2. SEO や初回表示の都合で SSR が必要になる
3. フロントだけでは扱いにくい API 集約が必要になる

### その他の機能改善案

1. 受付向けに「次に案内する部屋」を自動提案する
2. 部屋ごとの混雑推移を簡易グラフで見られるようにする
3. スタッフ向けに誤操作防止の undo を短時間だけ持たせる
4. 学園祭当日の回線断対策として read-only の最終同期時刻表示を強化する
