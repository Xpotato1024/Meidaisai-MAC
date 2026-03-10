import { setupAuthListener } from "./auth.js";
import { createAppContext } from "./context.js";
import { initializeThemeToggle } from "./theme.js";
const context = createAppContext();
initializeThemeToggle(context);
// --- アプリケーションの開始 ---
(() => {
    // initializeFirebase() は firebase-config.js で既に完了しているため削除
    // 代わりに auth オブジェクトがあるか確認してからリスナーを開始
    if (context.auth) {
        setupAuthListener(context);
    }
    else {
        console.error("Auth object not found. Check firebase-config.js");
        context.dom.firestoreStatus.textContent = "Firebase設定エラー";
    }
})();
