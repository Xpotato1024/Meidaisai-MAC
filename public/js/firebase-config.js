// public/js/firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, inMemoryPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig } from "./env.js";

// アプリの初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// セッション設定（main.jsでawaitを使わなくて済むよう、ここで設定しておくと楽ですが、
// main.jsの認証ロジック内で設定しても構いません。今回はexportだけします）

// 必要な機能をエクスポート
export { app, db, auth, setPersistence, inMemoryPersistence };