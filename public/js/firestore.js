import { collection, doc, documentId, getDocs, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAllowedRoomIds, hasRole } from "./access.js";
import { APP_CONFIG } from "./default-config.js";
import { cloneConfig } from "./context.js";
import { UI_ICON_SVGS } from "./icons.js";
import { normalizeReceptionLayoutConfig } from "./reception-layout.js";
import { normalizeRoomStateData } from "./room-state.js";
import { scheduleRender, updateGlobalHeader } from "./render.js";
import { flushWaitingGroupSync } from "./writes.js";
function toTimestampMillis(value) {
    if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
        return value.toDate().getTime();
    }
    return 0;
}
function sortMembers(members) {
    return [...members].sort((left, right) => left.displayName.localeCompare(right.displayName, "ja"));
}
function sortRequests(requests) {
    return [...requests].sort((left, right) => {
        const leftPending = left.status === "pending" ? 0 : 1;
        const rightPending = right.status === "pending" ? 0 : 1;
        if (leftPending !== rightPending) {
            return leftPending - rightPending;
        }
        return toTimestampMillis(right.requestedAt) - toTimestampMillis(left.requestedAt);
    });
}
function mergeNamedCollection(defaults, currentValue) {
    if (!Array.isArray(currentValue)) {
        return [...defaults];
    }
    const providedItems = currentValue.filter((item) => {
        return Boolean(item && typeof item === "object" && "id" in item && typeof item.id === "string");
    });
    const defaultIds = new Set(defaults.map((item) => item.id));
    const mergedDefaults = defaults.map((defaultItem) => {
        const matched = providedItems.find((item) => item.id === defaultItem.id);
        return matched ? { ...defaultItem, ...matched } : defaultItem;
    });
    const extraItems = providedItems.filter((item) => !defaultIds.has(item.id));
    return [...mergedDefaults, ...extraItems];
}
function normalizeConfig(rawConfig) {
    const rooms = Array.isArray(rawConfig.rooms) ? rawConfig.rooms : APP_CONFIG.rooms;
    const laneStatuses = mergeNamedCollection(APP_CONFIG.laneStatuses, rawConfig.laneStatuses)
        .map((status) => {
        const fallback = APP_CONFIG.laneStatuses.find((item) => item.id === status.id);
        return fallback
            ? { ...status, icon: fallback.icon, colorClass: fallback.colorClass }
            : status;
    });
    const receptionStatuses = mergeNamedCollection(APP_CONFIG.receptionStatuses, rawConfig.receptionStatuses)
        .map((status) => {
        const fallback = APP_CONFIG.receptionStatuses.find((item) => item.id === status.id);
        return fallback
            ? { ...status, icon: fallback.icon, colorClass: fallback.colorClass }
            : status;
    });
    return {
        ...APP_CONFIG,
        ...rawConfig,
        rooms,
        laneStatuses,
        receptionStatuses,
        pauseReasons: mergeNamedCollection(APP_CONFIG.pauseReasons, rawConfig.pauseReasons),
        options: Array.isArray(rawConfig.options) ? rawConfig.options : APP_CONFIG.options,
        receptionLayout: normalizeReceptionLayoutConfig(rawConfig.receptionLayout, rooms)
    };
}
export function cleanupDataSubscriptions(context) {
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
export function configureDataSubscriptions(context) {
    cleanupDataSubscriptions(context);
    if (!context.state.accessMember?.isActive) {
        return;
    }
    listenToConfigChanges(context);
    listenToRoomStateChanges(context);
    if (hasRole(context, ["admin", "staff", "reception"])) {
        listenToLaneChanges(context);
    }
    else {
        context.state.currentLanesState = {};
    }
    if (hasRole(context, ["admin"])) {
        listenToAccessRequestsChanges(context);
        listenToAccessMembersChanges(context);
    }
    else {
        context.state.accessRequestsCache = [];
        context.state.accessMembersCache = [];
        scheduleRender(context);
    }
}
/**
 * Firestoreの 'config' ドキュメントを監視
 */
export function listenToConfigChanges(context) {
    const { db, dom, paths, state } = context;
    const configRef = doc(db, paths.configPath);
    if (state.unsubscribeConfig) {
        state.unsubscribeConfig();
    }
    state.unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
        if (docSnap.exists()) {
            console.log("Config loaded from Firestore.");
            const firestoreData = docSnap.data();
            state.dynamicAppConfig = normalizeConfig(firestoreData);
            if (dom.firestoreStatus.textContent?.includes("設定なし")) {
                dom.firestoreStatus.textContent = "設定を読み込みました";
            }
        }
        else {
            console.warn("No config found in Firestore. Using local default settings (READ-ONLY).");
            state.dynamicAppConfig = cloneConfig(APP_CONFIG);
        }
        state.localAdminConfig = cloneConfig(state.dynamicAppConfig);
        updateGlobalHeader(context, state.dynamicAppConfig);
        scheduleRender(context);
    }, (error) => {
        console.error("Config listener error:", error);
        dom.firestoreStatus.textContent = "設定ファイルの読み込みに失敗しました。";
    });
}
function buildRoomStateQuery(context) {
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
export function listenToRoomStateChanges(context) {
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
    state.unsubscribeRoomState = onSnapshot(snapshotQuery, (querySnapshot) => {
        console.log("Room state data updated...");
        state.currentRoomState = {};
        const roomsReadyToResume = [];
        querySnapshot.forEach((roomStateDoc) => {
            const totalLanes = context.state.dynamicAppConfig.rooms.find((room) => room.id === roomStateDoc.id)?.lanes || 0;
            state.currentRoomState[roomStateDoc.id] = normalizeRoomStateData(roomStateDoc.data(), totalLanes);
            const localTarget = state.waitingGroupLocalTargets[roomStateDoc.id];
            const liveWaitingGroups = Number(state.currentRoomState[roomStateDoc.id]?.waitingGroups || 0);
            if (typeof localTarget === "number" && !state.waitingGroupSyncInFlight[roomStateDoc.id] && localTarget === liveWaitingGroups) {
                delete state.waitingGroupLocalTargets[roomStateDoc.id];
                delete state.waitingGroupInFlightTargets[roomStateDoc.id];
            }
            else if (typeof localTarget === "number"
                && !state.waitingGroupSyncInFlight[roomStateDoc.id]
                && typeof state.waitingGroupSyncTimers[roomStateDoc.id] !== "number") {
                roomsReadyToResume.push(roomStateDoc.id);
            }
        });
        scheduleRender(context);
        roomsReadyToResume.forEach((roomId) => {
            void flushWaitingGroupSync(context, roomId);
        });
    }, (error) => {
        console.error("Room state listener error:", error);
        dom.firestoreStatus.textContent = "部屋待機情報の取得に失敗しました。";
    });
}
function buildLaneQuery(context) {
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
export function listenToLaneChanges(context) {
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
    state.unsubscribeLanes = onSnapshot(snapshotQuery, (querySnapshot) => {
        console.log("Lane data updated...");
        state.currentLanesState = {};
        querySnapshot.forEach((laneDoc) => {
            state.currentLanesState[laneDoc.id] = laneDoc.data();
        });
        scheduleRender(context);
    }, (error) => {
        console.error("Lanes listener error:", error);
        dom.firestoreStatus.textContent = "レーン情報の取得に失敗しました。";
    });
}
function listenToAccessRequestsChanges(context) {
    const { db, paths, state } = context;
    const snapshotQuery = query(collection(db, paths.accessRequestsCollectionPath));
    state.unsubscribeAccessRequests = onSnapshot(snapshotQuery, (querySnapshot) => {
        const requests = [];
        querySnapshot.forEach((requestDoc) => {
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
function listenToAccessMembersChanges(context) {
    const { db, paths, state } = context;
    const snapshotQuery = query(collection(db, paths.accessMembersCollectionPath));
    state.unsubscribeAccessMembers = onSnapshot(snapshotQuery, (querySnapshot) => {
        const members = [];
        querySnapshot.forEach((memberDoc) => {
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
export async function fetchRegistryItems(context) {
    const { db, dom, paths, state } = context;
    dom.dbEventList.innerHTML = `<p class="p-4 text-center text-gray-400 text-sm"><span class="inline-flex align-middle text-slate-500">${UI_ICON_SVGS.spinner}</span><span class="ml-2 align-middle">読み込み中...</span></p>`;
    try {
        const snapshotQuery = query(collection(db, paths.registryCollectionPath));
        const querySnapshot = await getDocs(snapshotQuery);
        state.registryCache = [];
        querySnapshot.forEach((registryDoc) => {
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
    }
    catch (error) {
        console.error("Error fetching registry:", error);
        dom.dbEventList.innerHTML = '<p class="p-4 text-center text-red-500 text-sm">読み込みに失敗しました。</p>';
    }
}
