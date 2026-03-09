import { GoogleAuthProvider, onAuthStateChanged, signInWithCustomToken, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getDefaultTab } from "./access.js";
import { browserLocalPersistence, setPersistence } from "./firebase-config.js";
import { cloneConfig } from "./context.js";
import { APP_CONFIG } from "./default-config.js";
import { setupEventListeners } from "./events.js";
import { cleanupDataSubscriptions, configureDataSubscriptions } from "./firestore.js";
import { normalizeEmail } from "./member-directory.js";
import { renderAllUI } from "./render.js";
function normalizeMember(uid, data) {
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        grade: typeof data.grade === "string" ? data.grade : null,
        role: data.role || "staff",
        isActive: data.isActive !== false,
        assignedRoomIds: Array.isArray(data.assignedRoomIds) ? data.assignedRoomIds.map(String) : [],
        authorizationSource: typeof data.authorizationSource === "string" ? data.authorizationSource : null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: data.lastLoginAt
    };
}
function normalizeRequest(uid, data) {
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        status: data.status || "pending",
        note: typeof data.note === "string" ? data.note : null,
        requestedAt: data.requestedAt,
        lastSeenAt: data.lastSeenAt,
        updatedAt: data.updatedAt
    };
}
function cleanupSelfAccessListeners(context) {
    context.state.unsubscribeGlobalAccessMember?.();
    context.state.unsubscribeAccessMember?.();
    context.state.unsubscribeAccessRequest?.();
    context.state.unsubscribeGlobalAccessMember = null;
    context.state.unsubscribeAccessMember = null;
    context.state.unsubscribeAccessRequest = null;
}
function resetAuthorizedData(context) {
    const { state } = context;
    cleanupDataSubscriptions(context);
    state.currentLanesState = {};
    state.currentRoomState = {};
    state.localAdminConfig = cloneConfig(APP_CONFIG);
    state.dynamicAppConfig = cloneConfig(APP_CONFIG);
    state.accessMembersCache = [];
    state.accessRequestsCache = [];
}
function normalizeGlobalMember(uid, data) {
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        grade: typeof data.grade === "string" ? data.grade : null,
        role: data.role || "admin",
        isActive: data.isActive !== false,
        assignedRoomIds: [],
        authorizationSource: "global",
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: data.lastLoginAt
    };
}
function resolveEffectiveAccessMember(context) {
    const globalMember = context.state.globalAccessMember;
    if (globalMember?.isActive && globalMember.role === "admin") {
        return globalMember;
    }
    return context.state.eventAccessMember;
}
async function ensureAccessRequest(context, user) {
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
async function ensureRosterAccessMember(context, user) {
    const { db, paths } = context;
    const emailKey = normalizeEmail(String(user.email || ""));
    if (!emailKey) {
        return false;
    }
    const directoryRef = doc(db, paths.memberDirectoryCollectionPath, emailKey);
    const directorySnapshot = await getDoc(directoryRef);
    if (!directorySnapshot.exists()) {
        return false;
    }
    const directoryData = directorySnapshot.data();
    const resolvedDisplayName = String(directoryData.displayName || user.displayName || "");
    const resolvedEmail = String(directoryData.email || emailKey);
    const resolvedGrade = typeof directoryData.grade === "string" ? directoryData.grade : null;
    await setDoc(doc(db, paths.accessMembersCollectionPath, user.uid), {
        uid: user.uid,
        email: resolvedEmail,
        displayName: resolvedDisplayName,
        grade: resolvedGrade,
        role: "staff",
        isActive: true,
        assignedRoomIds: [],
        authorizationSource: "roster",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
    }, { merge: true });
    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);
    const requestSnapshot = await getDoc(requestRef);
    if (requestSnapshot.exists()) {
        await setDoc(requestRef, {
            email: resolvedEmail,
            displayName: resolvedDisplayName,
            status: "approved",
            note: "名簿登録済みのため自動承認",
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
    }
    return true;
}
async function bootstrapSelfAccess(context, user) {
    const { db, paths } = context;
    const globalMemberSnapshot = await getDoc(doc(db, paths.globalAccessMembersCollectionPath, user.uid));
    if (globalMemberSnapshot.exists()) {
        const globalData = globalMemberSnapshot.data();
        if (globalData.role === "admin" && globalData.isActive !== false) {
            return;
        }
    }
    const memberSnapshot = await getDoc(doc(db, paths.accessMembersCollectionPath, user.uid));
    if (memberSnapshot.exists()) {
        return;
    }
    const provisionedFromRoster = await ensureRosterAccessMember(context, user);
    if (provisionedFromRoster) {
        return;
    }
    await ensureAccessRequest(context, user);
}
function bindAuthButtons(context) {
    const { auth, dom } = context;
    dom.authSignInBtn.onclick = async () => {
        try {
            await setPersistence(auth, browserLocalPersistence);
            const provider = new GoogleAuthProvider();
            provider.addScope("email");
            await signInWithPopup(auth, provider);
        }
        catch (error) {
            console.error("Google sign-in failed:", error);
            alert("Google ログインに失敗しました。設定とブラウザのポップアップ制限を確認してください。");
        }
    };
    dom.authSignOutBtn.onclick = async () => {
        try {
            await signOut(auth);
        }
        catch (error) {
            console.error("Sign-out failed:", error);
        }
    };
}
function attachSelfAccessListeners(context, user) {
    const { db, dom, paths, state } = context;
    const globalMemberRef = doc(db, paths.globalAccessMembersCollectionPath, user.uid);
    const memberRef = doc(db, paths.accessMembersCollectionPath, user.uid);
    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);
    const syncEffectiveMember = () => {
        const effectiveMember = resolveEffectiveAccessMember(context);
        state.accessMember = effectiveMember;
        if (effectiveMember) {
            state.activeTab = getDefaultTab(context);
            dom.firestoreStatus.textContent = effectiveMember.isActive
                ? "✅ 権限確認済み / リアルタイム接続完了"
                : "⛔ このアカウントは無効化されています";
            dom.firestoreStatus.className = effectiveMember.isActive
                ? "text-center text-xs text-green-600"
                : "text-center text-xs text-rose-600 font-bold";
            if (!state.isUiInitialized) {
                setupEventListeners(context);
                state.isUiInitialized = true;
            }
            if (effectiveMember.isActive) {
                configureDataSubscriptions(context);
            }
            else {
                resetAuthorizedData(context);
            }
        }
        else {
            dom.firestoreStatus.textContent = "承認待ちです";
            dom.firestoreStatus.className = "text-center text-xs text-amber-600";
            resetAuthorizedData(context);
        }
        renderAllUI(context);
    };
    state.unsubscribeGlobalAccessMember = onSnapshot(globalMemberRef, (globalMemberSnap) => {
        state.globalAccessMember = globalMemberSnap.exists()
            ? normalizeGlobalMember(user.uid, globalMemberSnap.data())
            : null;
        syncEffectiveMember();
    });
    state.unsubscribeAccessMember = onSnapshot(memberRef, async (memberSnap) => {
        state.eventAccessMember = memberSnap.exists()
            ? normalizeMember(user.uid, memberSnap.data())
            : null;
        syncEffectiveMember();
    });
    state.unsubscribeAccessRequest = onSnapshot(requestRef, (requestSnap) => {
        state.selfAccessRequest = requestSnap.exists()
            ? normalizeRequest(user.uid, requestSnap.data())
            : null;
        renderAllUI(context);
    });
}
/**
 * 認証状態の監視とメインロジックの開始
 */
export function setupAuthListener(context) {
    const { auth, dom, state } = context;
    bindAuthButtons(context);
    onAuthStateChanged(auth, async (user) => {
        cleanupSelfAccessListeners(context);
        if (user) {
            state.authUser = user;
            state.userId = user.uid;
            dom.firestoreStatus.textContent = "名簿と権限を確認しています...";
            dom.firestoreStatus.className = "text-center text-xs text-slate-500";
            try {
                await bootstrapSelfAccess(context, user);
            }
            catch (error) {
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
        state.eventAccessMember = null;
        state.globalAccessMember = null;
        state.accessMember = null;
        state.selfAccessRequest = null;
        dom.firestoreStatus.textContent = "ログイン待機中";
        dom.firestoreStatus.className = "text-center text-xs text-slate-500";
        resetAuthorizedData(context);
        renderAllUI(context);
        if (state.initialAuthToken) {
            try {
                await signInWithCustomToken(auth, state.initialAuthToken);
            }
            catch (error) {
                console.error("認証エラー:", error);
                const message = error instanceof Error ? error.message : String(error);
                dom.firestoreStatus.textContent = `認証エラー: ${message}`;
                dom.firestoreStatus.className = "text-center text-red-500 font-bold";
            }
        }
    });
}
