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

import { canAccessTab, getDefaultTab } from "./access.js";
import { browserLocalPersistence, setPersistence } from "./firebase-config.js";
import { cloneConfig } from "./context.js";
import { APP_CONFIG } from "./default-config.js";
import { setupEventListeners } from "./events.js";
import { cleanupDataSubscriptions, configureDataSubscriptions } from "./firestore.js";
import { normalizeEmail } from "./member-directory.js";
import { renderAllUI } from "./render.js";
import { showToast } from "./toast.js";
import type { AccessMember, AccessRequest, AppContext, RoleId } from "./types.js";

const ACCESS_CACHE_PREFIX = "meidaisai-mac:self-access:";

interface ResolvedDirectoryProfile {
    email: string;
    displayName: string;
    grade: string | null;
}

interface CachedSelfAccessPayload {
    appId: string;
    uid: string;
    eventAccessMember: AccessMember | null;
    globalAccessMember: AccessMember | null;
    selfAccessRequest: AccessRequest | null;
}

function normalizeRole(rawRole: unknown, fallback: RoleId): RoleId {
    return rawRole === "root" || rawRole === "admin" || rawRole === "reception" || rawRole === "staff"
        ? rawRole
        : fallback;
}

function normalizeMember(uid: string, data: Record<string, unknown>): AccessMember {
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        grade: typeof data.grade === "string" ? data.grade : null,
        role: normalizeRole(data.role, "staff"),
        isActive: data.isActive !== false,
        assignedRoomIds: Array.isArray(data.assignedRoomIds) ? data.assignedRoomIds.map(String) : [],
        authorizationSource: typeof data.authorizationSource === "string" ? data.authorizationSource as any : null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: data.lastLoginAt
    };
}

function normalizeGlobalMember(uid: string, data: Record<string, unknown>): AccessMember {
    const rawRole = data.role === "admin" ? "root" : data.role;
    return {
        uid,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        grade: typeof data.grade === "string" ? data.grade : null,
        role: normalizeRole(rawRole, "root"),
        isActive: data.isActive !== false,
        assignedRoomIds: [],
        authorizationSource: "global",
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

function getCacheKey(appId: string, uid: string): string {
    return `${ACCESS_CACHE_PREFIX}${appId}:${uid}`;
}

function readCachedSelfAccess(context: AppContext, uid: string): CachedSelfAccessPayload | null {
    try {
        const rawValue = window.localStorage.getItem(getCacheKey(context.currentAppId, uid));
        if (!rawValue) {
            return null;
        }
        const parsed = JSON.parse(rawValue) as CachedSelfAccessPayload | null;
        if (!parsed || parsed.uid !== uid || parsed.appId !== context.currentAppId) {
            return null;
        }
        return parsed;
    } catch (error) {
        console.warn("Failed to read self access cache.", error);
        return null;
    }
}

function writeCachedSelfAccess(context: AppContext): void {
    const uid = context.state.userId;
    if (!uid) {
        return;
    }

    const payload: CachedSelfAccessPayload = {
        appId: context.currentAppId,
        uid,
        eventAccessMember: context.state.eventAccessMember,
        globalAccessMember: context.state.globalAccessMember,
        selfAccessRequest: context.state.selfAccessRequest
    };

    try {
        window.localStorage.setItem(getCacheKey(context.currentAppId, uid), JSON.stringify(payload));
    } catch (error) {
        console.warn("Failed to persist self access cache.", error);
    }
}

function clearCachedSelfAccess(context: AppContext, uid: string): void {
    try {
        window.localStorage.removeItem(getCacheKey(context.currentAppId, uid));
    } catch (error) {
        console.warn("Failed to clear self access cache.", error);
    }
}

function resolveEffectiveAccessMember(context: AppContext): AccessMember | null {
    const globalMember = context.state.globalAccessMember;
    if (globalMember?.isActive) {
        return globalMember;
    }
    return context.state.eventAccessMember;
}

async function resolveDirectoryProfile(context: AppContext, email: string | null | undefined): Promise<ResolvedDirectoryProfile | null> {
    const emailKey = normalizeEmail(String(email || ""));
    if (!emailKey) {
        return null;
    }

    const directoryRef = doc(context.db, context.paths.memberDirectoryCollectionPath, emailKey);
    const directorySnapshot = await getDoc(directoryRef);
    if (!directorySnapshot.exists()) {
        return null;
    }

    const data = directorySnapshot.data() as Record<string, unknown>;
    return {
        email: String(data.email || emailKey),
        displayName: String(data.displayName || ""),
        grade: typeof data.grade === "string" ? data.grade : null
    };
}

function resolveFallbackDisplayName(user: any, directoryProfile: ResolvedDirectoryProfile | null): string {
    const rosterName = String(directoryProfile?.displayName || "").trim();
    if (rosterName) {
        return rosterName;
    }

    const email = String(directoryProfile?.email || user.email || "").trim();
    const [localPart] = email.split("@");
    return localPart || email || "未設定";
}

function cleanupSelfAccessListeners(context: AppContext): void {
    context.state.unsubscribeGlobalAccessMember?.();
    context.state.unsubscribeAccessMember?.();
    context.state.unsubscribeAccessRequest?.();
    context.state.unsubscribeGlobalAccessMember = null;
    context.state.unsubscribeAccessMember = null;
    context.state.unsubscribeAccessRequest = null;
}

function resetAuthorizedData(context: AppContext): void {
    const { state } = context;
    cleanupDataSubscriptions(context);
    Object.values(state.waitingGroupSyncTimers).forEach((timerId) => {
        window.clearTimeout(timerId);
    });
    state.currentLanesState = {};
    state.currentRoomState = {};
    state.localAdminConfig = cloneConfig(APP_CONFIG);
    state.dynamicAppConfig = cloneConfig(APP_CONFIG);
    state.accessMembersCache = [];
    state.accessRequestsCache = [];
    state.waitingGroupLocalTargets = {};
    state.waitingGroupInFlightTargets = {};
    state.waitingGroupSyncTimers = {};
    state.waitingGroupSyncInFlight = {};
}

async function ensureAccessRequest(
    context: AppContext,
    user: any,
    directoryProfile: ResolvedDirectoryProfile | null,
    manualDisplayName: string
): Promise<void> {
    const { db, paths } = context;
    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);
    const requestSnapshot = await getDoc(requestRef);
    const displayName = String(manualDisplayName || requestSnapshot.data()?.displayName || "").trim();
    const email = String(directoryProfile?.email || user.email || "");

    if (!displayName) {
        throw new Error("表示名を入力してください。");
    }

    if (requestSnapshot.exists()) {
        await setDoc(requestRef, {
            email,
            displayName,
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        return;
    }

    await setDoc(requestRef, {
        uid: user.uid,
        email,
        displayName,
        status: "pending",
        note: null,
        requestedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

async function ensureRosterAccessMember(
    context: AppContext,
    user: any,
    directoryProfile?: ResolvedDirectoryProfile | null
): Promise<boolean> {
    const profile = directoryProfile || await resolveDirectoryProfile(context, user.email);
    if (!profile) {
        return false;
    }

    await setDoc(doc(context.db, context.paths.accessMembersCollectionPath, user.uid), {
        uid: user.uid,
        email: profile.email,
        displayName: resolveFallbackDisplayName(user, profile),
        grade: profile.grade,
        role: "staff",
        isActive: true,
        assignedRoomIds: [],
        authorizationSource: "roster",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
    }, { merge: true });

    const requestRef = doc(context.db, context.paths.accessRequestsCollectionPath, user.uid);
    const requestSnapshot = await getDoc(requestRef);
    if (requestSnapshot.exists()) {
        await setDoc(requestRef, {
            email: profile.email,
            displayName: resolveFallbackDisplayName(user, profile),
            status: "approved",
            note: "名簿登録済みのため自動承認",
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
    }

    return true;
}

async function bootstrapSelfAccess(context: AppContext, user: any): Promise<void> {
    const { db, paths } = context;
    const directoryProfile = await resolveDirectoryProfile(context, user.email);
    const globalMemberSnapshot = await getDoc(doc(db, paths.globalAccessMembersCollectionPath, user.uid));
    if (globalMemberSnapshot.exists()) {
        const globalData = globalMemberSnapshot.data() as Record<string, unknown>;
        const globalRole = globalData.role === "admin" ? "root" : globalData.role;
        if ((globalRole === "root" || globalRole === "admin") && globalData.isActive !== false) {
            return;
        }
    }

    const memberSnapshot = await getDoc(doc(db, paths.accessMembersCollectionPath, user.uid));
    if (memberSnapshot.exists()) {
        const existing = memberSnapshot.data() as Record<string, unknown>;
        await setDoc(doc(db, paths.accessMembersCollectionPath, user.uid), {
            email: String(existing.email || directoryProfile?.email || user.email || ""),
            displayName: String(existing.displayName || directoryProfile?.displayName || "").trim() || resolveFallbackDisplayName(user, directoryProfile),
            grade: directoryProfile?.grade || null,
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        return;
    }

    const provisionedFromRoster = await ensureRosterAccessMember(context, user, directoryProfile);
    if (provisionedFromRoster) {
        return;
    }

    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);
    const requestSnapshot = await getDoc(requestRef);
    if (requestSnapshot.exists()) {
        await setDoc(requestRef, {
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
    }
}

export async function submitManualAccessRequest(context: AppContext): Promise<void> {
    const user = context.state.authUser;
    if (!user) {
        showToast({
            title: "ログイン未完了",
            message: "先に Google ログインしてください。",
            tone: "warning"
        });
        return;
    }

    const manualDisplayName = context.dom.authManualDisplayNameInput.value.trim();
    if (!manualDisplayName) {
        showToast({
            title: "入力不足",
            message: "承認リクエスト用の表示名を入力してください。",
            tone: "warning"
        });
        return;
    }

    const directoryProfile = await resolveDirectoryProfile(context, user.email);
    if (directoryProfile) {
        showToast({
            title: "名簿登録済み",
            message: "このアカウントは名簿登録済みです。再読み込み後に自動承認状態を確認してください。",
            tone: "info"
        });
        return;
    }

    await ensureAccessRequest(context, user, null, manualDisplayName);
    showToast({
        title: "送信完了",
        message: "承認リクエストを送信しました。",
        tone: "success"
    });
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
            showToast({
                title: "ログイン失敗",
                message: "Google ログインに失敗しました。設定とブラウザのポップアップ状態を確認してください。",
                tone: "error"
            });
        }
    };

    dom.authSignOutBtn.onclick = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Sign-out failed:", error);
        }
    };

    dom.authManualRequestSubmitBtn.onclick = async () => {
        try {
            await submitManualAccessRequest(context);
        } catch (error) {
            console.error("Manual access request failed:", error);
            const message = error instanceof Error ? error.message : String(error);
            showToast({
                title: "送信失敗",
                message,
                tone: "error"
            });
        }
    };
}

function attachSelfAccessListeners(context: AppContext, user: any): void {
    const { db, dom, paths, state } = context;
    const globalMemberRef = doc(db, paths.globalAccessMembersCollectionPath, user.uid);
    const memberRef = doc(db, paths.accessMembersCollectionPath, user.uid);
    const requestRef = doc(db, paths.accessRequestsCollectionPath, user.uid);

    const syncEffectiveMember = (): void => {
        const effectiveMember = resolveEffectiveAccessMember(context);
        state.accessMember = effectiveMember;

        if (effectiveMember) {
            if (!canAccessTab(context, state.activeTab)) {
                state.activeTab = getDefaultTab(context);
            }
            dom.firestoreStatus.textContent = effectiveMember.isActive
                ? "権限確認済み / リアルタイム接続完了"
                : "このアカウントは無効化されています";
            dom.firestoreStatus.className = effectiveMember.isActive
                ? "auth-runtime-status auth-runtime-status-ready"
                : "auth-runtime-status auth-runtime-status-error";

            if (!state.isUiInitialized) {
                setupEventListeners(context);
                state.isUiInitialized = true;
            }

            if (effectiveMember.isActive) {
                configureDataSubscriptions(context);
            } else {
                resetAuthorizedData(context);
            }
        } else {
            dom.firestoreStatus.textContent = "承認待ちです";
            dom.firestoreStatus.className = "auth-runtime-status auth-runtime-status-pending";
            resetAuthorizedData(context);
        }

        writeCachedSelfAccess(context);
        renderAllUI(context);
    };

    state.unsubscribeGlobalAccessMember = onSnapshot(globalMemberRef, (globalMemberSnap: any) => {
        state.globalAccessMember = globalMemberSnap.exists()
            ? normalizeGlobalMember(user.uid, globalMemberSnap.data())
            : null;
        syncEffectiveMember();
    });

    state.unsubscribeAccessMember = onSnapshot(memberRef, (memberSnap: any) => {
        state.eventAccessMember = memberSnap.exists()
            ? normalizeMember(user.uid, memberSnap.data())
            : null;
        syncEffectiveMember();
    });

    state.unsubscribeAccessRequest = onSnapshot(requestRef, (requestSnap: any) => {
        state.selfAccessRequest = requestSnap.exists()
            ? normalizeRequest(user.uid, requestSnap.data())
            : null;
        writeCachedSelfAccess(context);
        renderAllUI(context);
    });
}

export function setupAuthListener(context: AppContext): void {
    const { auth, dom, state } = context;
    bindAuthButtons(context);

    onAuthStateChanged(auth, async (user: any) => {
        cleanupSelfAccessListeners(context);

        if (user) {
            state.authUser = user;
            state.userId = user.uid;

            const cached = readCachedSelfAccess(context, user.uid);
            if (cached) {
                state.eventAccessMember = cached.eventAccessMember;
                state.globalAccessMember = cached.globalAccessMember;
                state.selfAccessRequest = cached.selfAccessRequest;
                state.accessMember = cached.globalAccessMember || cached.eventAccessMember;
                renderAllUI(context);
            }

            dom.firestoreStatus.textContent = "名簿と権限を確認しています...";
            dom.firestoreStatus.className = "text-center text-xs text-slate-500";

            try {
                await bootstrapSelfAccess(context, user);
            } catch (error) {
                console.error("Failed to ensure access request:", error);
                dom.firestoreStatus.textContent = "アクセス申請の初期化に失敗しました。";
                dom.firestoreStatus.className = "text-center text-xs font-bold text-red-500";
            }

            attachSelfAccessListeners(context, user);
            renderAllUI(context);
            return;
        }

        const previousUid = state.userId;
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

        if (previousUid) {
            clearCachedSelfAccess(context, previousUid);
        }

        if (state.initialAuthToken) {
            try {
                await signInWithCustomToken(auth, state.initialAuthToken);
            } catch (error) {
                console.error("Custom token sign-in failed:", error);
                const message = error instanceof Error ? error.message : String(error);
                dom.firestoreStatus.textContent = `認証エラー: ${message}`;
                dom.firestoreStatus.className = "text-center font-bold text-red-500";
            }
        }
    });
}
