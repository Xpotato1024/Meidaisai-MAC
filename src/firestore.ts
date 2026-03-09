import {
    collection,
    doc,
    documentId,
    getDocs,
    onSnapshot,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getAllowedRoomIds, hasRole } from "./access.js";
import { APP_CONFIG } from "./default-config.js";
import { cloneConfig } from "./context.js";
import { scheduleRender, updateGlobalHeader } from "./render.js";
import type { AccessMember, AccessRequest, AppContext } from "./types.js";

function toTimestampMillis(value: unknown): number {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as any).toDate === "function") {
        return (value as any).toDate().getTime();
    }
    return 0;
}

function sortMembers(members: AccessMember[]): AccessMember[] {
    return [...members].sort((left, right) => left.displayName.localeCompare(right.displayName, "ja"));
}

function sortRequests(requests: AccessRequest[]): AccessRequest[] {
    return [...requests].sort((left, right) => {
        const leftPending = left.status === "pending" ? 0 : 1;
        const rightPending = right.status === "pending" ? 0 : 1;
        if (leftPending !== rightPending) {
            return leftPending - rightPending;
        }
        return toTimestampMillis(right.requestedAt) - toTimestampMillis(left.requestedAt);
    });
}

export function cleanupDataSubscriptions(context: AppContext): void {
    const { state } = context;

    state.unsubscribeConfig?.();
    state.unsubscribeLanes?.();
    state.unsubscribeRoomState?.();
    state.unsubscribeAccessMembers?.();
    state.unsubscribeAccessRequests?.();

    state.unsubscribeConfig = null;
    state.unsubscribeLanes = null;
    state.unsubscribeRoomState = null;
    state.unsubscribeAccessMembers = null;
    state.unsubscribeAccessRequests = null;
}

export function configureDataSubscriptions(context: AppContext): void {
    cleanupDataSubscriptions(context);

    if (!context.state.accessMember?.isActive) {
        return;
    }

    listenToConfigChanges(context);
    listenToRoomStateChanges(context);
    listenToLaneChanges(context);

    if (hasRole(context, ["admin"])) {
        listenToAccessRequestsChanges(context);
        listenToAccessMembersChanges(context);
    } else {
        context.state.accessRequestsCache = [];
        context.state.accessMembersCache = [];
        scheduleRender(context);
    }
}

/**
 * Firestoreの 'config' ドキュメントを監視
 */
export function listenToConfigChanges(context: AppContext): void {
    const { db, dom, paths, state } = context;
    const configRef = doc(db, paths.configPath);

    if (state.unsubscribeConfig) {
        state.unsubscribeConfig();
    }

    state.unsubscribeConfig = onSnapshot(
        configRef,
        (docSnap: any) => {
            if (docSnap.exists()) {
                console.log("Config loaded from Firestore.");
                const firestoreData = docSnap.data();

                state.dynamicAppConfig = {
                    ...APP_CONFIG,
                    ...firestoreData
                };

                if (!firestoreData.laneStatuses) {
                    state.dynamicAppConfig.laneStatuses = APP_CONFIG.laneStatuses;
                }
                if (!firestoreData.pauseReasons) {
                    state.dynamicAppConfig.pauseReasons = APP_CONFIG.pauseReasons;
                }

                if (dom.firestoreStatus.textContent?.includes("設定なし")) {
                    dom.firestoreStatus.textContent = "設定を読み込みました";
                }
            } else {
                console.warn("No config found in Firestore. Using local default settings (READ-ONLY).");
                state.dynamicAppConfig = cloneConfig(APP_CONFIG);
            }

            state.localAdminConfig = cloneConfig(state.dynamicAppConfig);

            updateGlobalHeader(context, state.dynamicAppConfig);
            scheduleRender(context);
        },
        (error: unknown) => {
            console.error("Config listener error:", error);
            dom.firestoreStatus.textContent = "設定ファイルの読み込みに失敗しました。";
        }
    );
}

function buildRoomStateQuery(context: AppContext): any | null {
    const { db, paths } = context;
    const allowedRoomIds = getAllowedRoomIds(context);

    if (hasRole(context, ["staff"])) {
        if (allowedRoomIds.length === 0) {
            return null;
        }
        if (allowedRoomIds.length === 1) {
            return query(collection(db, paths.roomStateCollectionPath), where(documentId(), "==", allowedRoomIds[0]));
        }
        return query(collection(db, paths.roomStateCollectionPath), where(documentId(), "in", allowedRoomIds.slice(0, 10)));
    }

    return query(collection(db, paths.roomStateCollectionPath));
}

/**
 * Firestoreの 'roomState' コレクションを監視
 */
export function listenToRoomStateChanges(context: AppContext): void {
    const { dom, state } = context;
    const snapshotQuery = buildRoomStateQuery(context);

    if (state.unsubscribeRoomState) {
        state.unsubscribeRoomState();
    }

    if (!snapshotQuery) {
        state.currentRoomState = {};
        scheduleRender(context);
        return;
    }

    state.unsubscribeRoomState = onSnapshot(
        snapshotQuery,
        (querySnapshot: any) => {
            console.log("Room state data updated...");
            state.currentRoomState = {};
            querySnapshot.forEach((roomStateDoc: any) => {
                state.currentRoomState[roomStateDoc.id] = roomStateDoc.data();
            });

            scheduleRender(context);
        },
        (error: unknown) => {
            console.error("Room state listener error:", error);
            dom.firestoreStatus.textContent = "部屋待機情報の取得に失敗しました。";
        }
    );
}

function buildLaneQuery(context: AppContext): any | null {
    const { db, paths } = context;
    const allowedRoomIds = getAllowedRoomIds(context);

    if (hasRole(context, ["staff"])) {
        if (allowedRoomIds.length === 0) {
            return null;
        }
        if (allowedRoomIds.length === 1) {
            return query(collection(db, paths.lanesCollectionPath), where("roomId", "==", allowedRoomIds[0]));
        }
        return query(collection(db, paths.lanesCollectionPath), where("roomId", "in", allowedRoomIds.slice(0, 10)));
    }

    return query(collection(db, paths.lanesCollectionPath));
}

/**
 * Firestoreの 'lanes' コレクションを監視
 */
export function listenToLaneChanges(context: AppContext): void {
    const { dom, state } = context;
    const snapshotQuery = buildLaneQuery(context);

    if (state.unsubscribeLanes) {
        state.unsubscribeLanes();
    }

    if (!snapshotQuery) {
        state.currentLanesState = {};
        scheduleRender(context);
        return;
    }

    state.unsubscribeLanes = onSnapshot(
        snapshotQuery,
        (querySnapshot: any) => {
            console.log("Lane data updated...");
            state.currentLanesState = {};
            querySnapshot.forEach((laneDoc: any) => {
                state.currentLanesState[laneDoc.id] = laneDoc.data();
            });

            scheduleRender(context);
        },
        (error: unknown) => {
            console.error("Lanes listener error:", error);
            dom.firestoreStatus.textContent = "レーン情報の取得に失敗しました。";
        }
    );
}

function listenToAccessRequestsChanges(context: AppContext): void {
    const { db, paths, state } = context;
    const snapshotQuery = query(collection(db, paths.accessRequestsCollectionPath));

    state.unsubscribeAccessRequests = onSnapshot(snapshotQuery, (querySnapshot: any) => {
        const requests: AccessRequest[] = [];
        querySnapshot.forEach((requestDoc: any) => {
            const data = requestDoc.data();
            requests.push({
                uid: requestDoc.id,
                email: data.email || "",
                displayName: data.displayName || "",
                status: data.status || "pending",
                note: data.note || null,
                requestedAt: data.requestedAt,
                lastSeenAt: data.lastSeenAt,
                updatedAt: data.updatedAt
            });
        });

        state.accessRequestsCache = sortRequests(requests);
        scheduleRender(context);
    });
}

function listenToAccessMembersChanges(context: AppContext): void {
    const { db, paths, state } = context;
    const snapshotQuery = query(collection(db, paths.accessMembersCollectionPath));

    state.unsubscribeAccessMembers = onSnapshot(snapshotQuery, (querySnapshot: any) => {
        const members: AccessMember[] = [];
        querySnapshot.forEach((memberDoc: any) => {
            const data = memberDoc.data();
            members.push({
                uid: memberDoc.id,
                email: data.email || "",
                displayName: data.displayName || "",
                grade: typeof data.grade === "string" ? data.grade : null,
                role: data.role || "staff",
                isActive: data.isActive !== false,
                assignedRoomIds: Array.isArray(data.assignedRoomIds) ? data.assignedRoomIds : [],
                authorizationSource: typeof data.authorizationSource === "string" ? data.authorizationSource : null,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                lastLoginAt: data.lastLoginAt
            });
        });

        state.accessMembersCache = sortMembers(members);
        scheduleRender(context);
    });
}

export async function fetchRegistryItems(context: AppContext): Promise<void> {
    const { db, dom, paths, state } = context;
    dom.dbEventList.innerHTML = '<p class="p-4 text-center text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin"></i> 読み込み中...</p>';

    try {
        const snapshotQuery = query(collection(db, paths.registryCollectionPath));
        const querySnapshot = await getDocs(snapshotQuery);

        state.registryCache = [];
        querySnapshot.forEach((registryDoc: any) => {
            const data = registryDoc.data();
            const date = data.lastUpdated ? data.lastUpdated.toDate() : new Date();

            state.registryCache.push({
                ...data,
                dateObj: date,
                dateStr: date.toLocaleString("ja-JP")
            });
        });

        state.registryCache.sort((left, right) => {
            return (right.dateObj?.getTime() || 0) - (left.dateObj?.getTime() || 0);
        });
    } catch (error) {
        console.error("Error fetching registry:", error);
        dom.dbEventList.innerHTML = '<p class="p-4 text-center text-red-500 text-sm">読み込みに失敗しました。</p>';
    }
}
