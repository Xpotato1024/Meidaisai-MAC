import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { browserLocalPersistence, getAuth, setPersistence, inMemoryPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import * as FirebaseFirestore from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig } from "./env.js";

const { getFirestore } = FirebaseFirestore;
const enableMultiTabIndexedDbPersistence = (FirebaseFirestore as any).enableMultiTabIndexedDbPersistence as
    ((db: unknown) => Promise<void>) | undefined;

// アプリの初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

if (enableMultiTabIndexedDbPersistence) {
    void enableMultiTabIndexedDbPersistence(db).catch((error: unknown) => {
        console.warn("Firestore local cache is unavailable. Falling back to memory only.", error);
    });
}

// セッション設定（main.jsでawaitを使わなくて済むよう、ここで設定しておくと楽ですが、
// main.jsの認証ロジック内で設定しても構いません。今回はexportだけします）

// 必要な機能をエクスポート
export { app, db, auth, setPersistence, browserLocalPersistence, inMemoryPersistence };
