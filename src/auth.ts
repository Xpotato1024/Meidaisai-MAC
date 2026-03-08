import {
    onAuthStateChanged,
    signInAnonymously,
    signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { ADMIN_PASSWORD } from "./env.js";
import { setupEventListeners } from "./events.js";
import { listenToConfigChanges, listenToLaneChanges, listenToRoomStateChanges } from "./firestore.js";
import type { AppContext } from "./types.js";

const AUTH_KEY = "isAuthenticated";

/**
 * 受付/管理タブのアクセス認証チェック
 */
export function checkAuthentication(): boolean {
    if (sessionStorage.getItem(AUTH_KEY) === "true") {
        return true;
    }
    const inputPassword = prompt("受付・管理用のパスワードを入力してください:");
    if (inputPassword === ADMIN_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, "true");
        return true;
    }
    if (inputPassword !== null && inputPassword !== "") {
        alert("パスワードが間違っています。");
        return false;
    }
    return false;
}

/**
 * アプリケーションのメインロジック（認証後に実行）
 */
async function initializeAppLogic(context: AppContext): Promise<void> {
    const { db, state } = context;
    if (!db) {
        return;
    }

    if (state.isUiInitialized) {
        return;
    }
    state.isUiInitialized = true;

    // 1. イベントリスナーを設定
    setupEventListeners(context, checkAuthentication);

    // 2. Firestoreから設定を監視
    listenToConfigChanges(context);

    // 3. Firestoreからレーン情報を監視
    listenToLaneChanges(context);

    // 4. Firestoreから部屋状態(待機)を監視
    listenToRoomStateChanges(context);
}

/**
 * 認証状態の監視とメインロジックの開始
 */
export function setupAuthListener(context: AppContext): void {
    const { auth, dom, state } = context;

    onAuthStateChanged(auth, async (user: any) => {
        if (user) {
            // ユーザーがログイン済み
            state.userId = user.uid;
            console.log(`Authenticated. UserID: ${state.userId}`);
            dom.firestoreStatus.textContent = "✅ リアルタイム接続完了";
            dom.firestoreStatus.className = "text-center text-xs text-green-600";

            // メインロジックを実行
            await initializeAppLogic(context);
        } else {
            // ユーザーが未ログイン
            console.log("Not authenticated. Attempting sign-in...");
            dom.firestoreStatus.textContent = "認証中...";
            try {
                if (state.initialAuthToken) {
                    await signInWithCustomToken(auth, state.initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("認証エラー:", error);
                const message = error instanceof Error ? error.message : String(error);
                dom.firestoreStatus.textContent = `認証エラー: ${message}`;
                dom.firestoreStatus.className = "text-center text-red-500 font-bold";
            }
        }
    });
}
