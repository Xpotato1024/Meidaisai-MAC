import {
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithCustomToken,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getDefaultTab } from "./access.js";
import { browserLocalPersistence, setPersistence } from "./firebase-config.js";
import { cloneConfig } from "./context.js";
import { APP_CONFIG } from "./default-config.js";
import { setupEventListeners } from "./events.js";
import { cleanupDataSubscriptions, configureDataSubscriptions } from "./firestore.js";
import { renderAllUI } from "./render.js";
import type { AccessMember, AccessRequest, AppContext } from "./types.js";

function normalizeMember(uid: string, data: Record<string, unknown>): AccessMember {
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        role: (data.role as any) || "staff",
        isActive: data.isActive !== false,
        assignedRoomIds: Array.isArray(data.assignedRoomIds) ? data.assignedRoomIds.map(String) : [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: data.lastLoginAt
    };
}

function normalizeRequest(uid: string, data: Record<string, unknown>): AccessRequest {
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        status: (data.status as any) || "pending",
        note: typeof data.note === "string" ? data.note : null,
        requestedAt: data.requestedAt,
        lastSeenAt: data.lastSeenAt,
        updatedAt: data.updatedAt
    };
}

function cleanupSelfAccessListeners(context: AppContext): void {
    context.state.unsubscribeAccessMember?.();
    context.state.unsubscribeAccessRequest?.();
    context.state.unsubscribeAccessMember = null;
    context.state.unsubscribeAccessRequest = null;
}

function resetAuthorizedData(context: AppContext): void {
    const { state } = context;
    cleanupDataSubscriptions(context);
    state.currentLanesState = {};
    state.currentRoomState = {};
    state.localAdminConfig = cloneConfig(APP_CONFIG);
    state.dynamicAppConfig = cloneConfig(APP_CONFIG);
    state.accessMembersCache = [];
    state.accessRequestsCache = [];
}

async function ensureAccessRequest(context: AppContext, user: any): Promise<void> {
    const { db, paths } = context;
    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);
    const requestSnapshot = await getDoc(requestRef);

    if (requestSnapshot.exists()) {
        await setDoc(requestRef, {
            email: user.email || "",
            displayName: user.displayName || "",
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        return;
    }

    await setDoc(requestRef, {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        status: "pending",
        note: null,
        requestedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

function bindAuthButtons(context: AppContext): void {
    const { auth, dom } = context;

    dom.authSignInBtn.onclick = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            const provider = new GoogleAuthProvider();
            provider.addScope("email");
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Google sign-in failed:", error);
            alert("Google ログインに失敗しました。設定とブラウザのポップアップ制限を確認してください。");
        }
    };

    dom.authSignOutBtn.onclick = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Sign-out failed:", error);
        }
    };
}

function attachSelfAccessListeners(context: AppContext, user: any): void {
    const { db, dom, paths, state } = context;
    const memberRef = doc(db, paths.accessMembersCollectionPath, user.uid);
    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);

    state.unsubscribeAccessMember = onSnapshot(memberRef, async (memberSnap: any) => {
        if (memberSnap.exists()) {
            state.accessMember = normalizeMember(user.uid, memberSnap.data());
            state.activeTab = getDefaultTab(context);
            dom.firestoreStatus.textContent = state.accessMember.isActive
                ? "✅ 権限確認済み / リアルタイム接続完了"
                : "⛔ このアカウントは無効化されています";
            dom.firestoreStatus.className = state.accessMember.isActive
                ? "text-center text-xs text-green-600"
                : "text-center text-xs text-rose-600 font-bold";

            if (!state.isUiInitialized) {
                setupEventListeners(context);
                state.isUiInitialized = true;
            }

            if (state.accessMember.isActive) {
                configureDataSubscriptions(context);
            } else {
                resetAuthorizedData(context);
            }
        } else {
            state.accessMember = null;
            dom.firestoreStatus.textContent = "承認待ちです";
            dom.firestoreStatus.className = "text-center text-xs text-amber-600";
            resetAuthorizedData(context);
        }

        renderAllUI(context);
    });

    state.unsubscribeAccessRequest = onSnapshot(requestRef, (requestSnap: any) => {
        state.selfAccessRequest = requestSnap.exists()
            ? normalizeRequest(user.uid, requestSnap.data())
            : null;
        renderAllUI(context);
    });
}

/**
 * 認証状態の監視とメインロジックの開始
 */
export function setupAuthListener(context: AppContext): void {
    const { auth, dom, state } = context;
    bindAuthButtons(context);

    onAuthStateChanged(auth, async (user: any) => {
        cleanupSelfAccessListeners(context);

        if (user) {
            state.authUser = user;
            state.userId = user.uid;

            try {
                await ensureAccessRequest(context, user);
            } catch (error) {
                console.error("Failed to ensure access request:", error);
                dom.firestoreStatus.textContent = "アクセス申請の初期化に失敗しました。";
                dom.firestoreStatus.className = "text-center text-xs text-red-500 font-bold";
            }

            attachSelfAccessListeners(context, user);
            renderAllUI(context);
            return;
        }

        state.authUser = null;
        state.userId = null;
        state.accessMember = null;
        state.selfAccessRequest = null;
        dom.firestoreStatus.textContent = "ログイン待機中";
        dom.firestoreStatus.className = "text-center text-xs text-slate-500";
        resetAuthorizedData(context);
        renderAllUI(context);

        if (state.initialAuthToken) {
            try {
                await signInWithCustomToken(auth, state.initialAuthToken);
            } catch (error) {
                console.error("認証エラー:", error);
                const message = error instanceof Error ? error.message : String(error);
                dom.firestoreStatus.textContent = `認証エラー: ${message}`;
                dom.firestoreStatus.className = "text-center text-red-500 font-bold";
            }
        }
    });
}
