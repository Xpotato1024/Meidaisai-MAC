import * as FirebaseFirestore from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { canManageRoom, getActorDisplayName, hasRole } from "./access.js";
import { checkAndInitDatabase } from "./db-sync.js";
import { scheduleRender } from "./render.js";
import { applyLaneTransitionToRoomState, createEmptyRoomState, normalizeRoomStateData } from "./room-state.js";
import type { AppContext, LaneData, RoleId, RoomStateData } from "./types.js";

const { doc, serverTimestamp, setDoc, updateDoc } = FirebaseFirestore;
const runTransaction = (FirebaseFirestore as any).runTransaction as
    <T>(db: unknown, updateFn: (transaction: any) => Promise<T>) => Promise<T>;

function getRoomLaneCount(context: AppContext, roomId: string): number {
    return context.state.dynamicAppConfig.rooms.find((room) => room.id === roomId)?.lanes
        || Number(context.state.currentRoomState[roomId]?.totalLanes || 0);
}

function getWaitingGroupValue(record: Record<string, number>, roomId: string): number | undefined {
    return typeof record[roomId] === "number" ? Number(record[roomId]) : undefined;
}

function setWaitingGroupValue(record: Record<string, number>, roomId: string, value: number | undefined): void {
    if (typeof value !== "number" || Number.isNaN(value)) {
        delete record[roomId];
        return;
    }
    record[roomId] = Math.max(0, Math.floor(value));
}

function getDisplayedWaitingGroups(context: AppContext, roomId: string): number {
    const localTarget = getWaitingGroupValue(context.state.waitingGroupLocalTargets, roomId);
    if (typeof localTarget === "number") {
        return Math.max(0, localTarget);
    }

    const baseWaitingGroups = Number(context.state.currentRoomState[roomId]?.waitingGroups || 0);
    return Math.max(0, baseWaitingGroups);
}

function normalizeLaneData(rawData: Record<string, unknown>): LaneData {
    return {
        ...(rawData as LaneData),
        roomId: String(rawData.roomId || ""),
        roomName: typeof rawData.roomName === "string" ? rawData.roomName : undefined,
        laneNum: Number(rawData.laneNum || 0),
        status: String(rawData.status || "paused"),
        receptionStatus: String(rawData.receptionStatus || "available"),
        selectedOptions: Array.isArray(rawData.selectedOptions) ? rawData.selectedOptions.map(String) : [],
        staffName: typeof rawData.staffName === "string" ? rawData.staffName : null,
        customName: typeof rawData.customName === "string" ? rawData.customName : null,
        receptionNotes: typeof rawData.receptionNotes === "string" ? rawData.receptionNotes : null,
        pauseReasonId: typeof rawData.pauseReasonId === "string" ? rawData.pauseReasonId : null,
        revision: typeof rawData.revision === "number" ? rawData.revision : 0,
        updatedAt: rawData.updatedAt
    };
}

async function mutateLaneWithRoomState(
    context: AppContext,
    docId: string,
    mutation: (currentLane: LaneData) => LaneData | null
): Promise<boolean> {
    const { db, paths } = context;
    const laneRef = doc(db, paths.lanesCollectionPath, docId);

    return runTransaction(db, async (transaction) => {
        const laneSnap = await transaction.get(laneRef);
        if (!laneSnap.exists()) {
            throw new Error("レーン情報が見つかりません。");
        }

        const currentLane = normalizeLaneData(laneSnap.data() as Record<string, unknown>);
        const nextLane = mutation(currentLane);
        if (!nextLane) {
            return false;
        }

        const roomLaneCount = getRoomLaneCount(context, currentLane.roomId);
        const roomStateRef = doc(db, paths.roomStateCollectionPath, currentLane.roomId);
        const roomStateSnap = await transaction.get(roomStateRef);
        const currentRoomState: RoomStateData = roomStateSnap.exists()
            ? normalizeRoomStateData(roomStateSnap.data() as Record<string, unknown>, roomLaneCount)
            : createEmptyRoomState(roomLaneCount);
        const nextRoomState = applyLaneTransitionToRoomState(currentRoomState, currentLane, nextLane, roomLaneCount);

        transaction.set(laneRef, {
            ...nextLane,
            revision: Number(currentLane.revision || 0) + 1,
            updatedAt: serverTimestamp()
        }, { merge: true });
        transaction.set(roomStateRef, {
            ...nextRoomState,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    });
}

/**
 * レーン担当者がレーンの物理ステータスを更新
 */
export async function updateLaneStatus(context: AppContext, docId: string, newStatus: string): Promise<void> {
    const currentLane = context.state.currentLanesState[docId];
    if (!currentLane) {
        return;
    }
    if (!canManageRoom(context, currentLane.roomId)) {
        alert("この部屋のレーンは操作できません。");
        return;
    }

    const staffName = getActorDisplayName(context);
    if (!staffName) {
        alert("ログイン名を取得できませんでした。再ログインしてからやり直してください。");
        return;
    }

    if (currentLane.status === newStatus && currentLane.staffName === staffName) {
        return;
    }

    try {
        await mutateLaneWithRoomState(context, docId, (liveLane) => {
            if (liveLane.status === newStatus && liveLane.staffName === staffName) {
                return null;
            }

            const nextLane: LaneData = {
                ...liveLane,
                status: newStatus,
                staffName
            };

            if (newStatus !== "paused") {
                nextLane.pauseReasonId = null;
            }

            if (newStatus === "available" || newStatus === "preparing" || newStatus === "paused") {
                nextLane.selectedOptions = [];
                nextLane.receptionNotes = null;
            }

            return nextLane;
        });
    } catch (error) {
        console.error("Failed to update lane status:", error);
    }
}

export async function updateReceptionStatus(
    context: AppContext,
    docId: string,
    newStatus: string,
    staffName: string | null = null,
    options: string[] = [],
    notes: string | null = null,
    silent = false
): Promise<boolean> {
    const currentLane = context.state.currentLanesState[docId];
    if (!currentLane) {
        // 受付画面は常時 lanes を購読しないので、事前キャッシュが無くても処理は継続する。
    }

    const roomId = currentLane?.roomId || "";
    const canGuide = hasRole(context, ["admin", "reception"]);
    const canConfirmArrival = hasRole(context, ["admin"]) || (roomId ? canManageRoom(context, roomId) : hasRole(context, ["staff"]));

    if (newStatus === "guiding" && !canGuide) {
        if (!silent) {
            alert("受付権限を持つメンバーのみ案内操作できます。");
        }
        return false;
    }

    if (newStatus === "available" && !canConfirmArrival) {
        if (!silent) {
            alert("このレーンの到着確認を行う権限がありません。");
        }
        return false;
    }

    if (newStatus !== "guiding" && newStatus !== "available" && !hasRole(context, ["admin", "reception"])) {
        return false;
    }

    try {
        await mutateLaneWithRoomState(context, docId, (liveLane) => {
            const liveRoomId = liveLane.roomId;
            const canLiveConfirmArrival = hasRole(context, ["admin"]) || canManageRoom(context, liveRoomId);

            if (newStatus === "guiding") {
                if (!canGuide) {
                    throw new Error("受付権限を持つメンバーのみ案内操作できます。");
                }
                if (liveLane.status !== "available" || liveLane.receptionStatus === "guiding") {
                    throw new Error("このレーンはすでに案内に使用されています。");
                }

                const sameOptions = JSON.stringify(liveLane.selectedOptions || []) === JSON.stringify(options || []);
                const sameNotes = (liveLane.receptionNotes || null) === notes;
                if (liveLane.receptionStatus === "guiding" && sameOptions && sameNotes) {
                    return null;
                }

                return {
                    ...liveLane,
                    receptionStatus: "guiding",
                    selectedOptions: options,
                    receptionNotes: notes
                };
            }

            if (newStatus === "available") {
                if (!canLiveConfirmArrival) {
                    throw new Error("このレーンの到着確認を行う権限がありません。");
                }
                if (liveLane.receptionStatus !== "guiding") {
                    throw new Error("案内中のレーンのみ到着確認できます。");
                }

                const nextLane: LaneData = {
                    ...liveLane,
                    receptionStatus: "available",
                    status: "occupied"
                };

                if (staffName) {
                    nextLane.staffName = staffName;
                }

                return nextLane;
            }

            if (!hasRole(context, ["admin", "reception"])) {
                throw new Error("この受付状態を変更する権限がありません。");
            }

            return {
                ...liveLane,
                receptionStatus: newStatus
            };
        });
        return true;
    } catch (error) {
        console.error("Failed to update reception status:", error);
        if (!silent && error instanceof Error) {
            alert(error.message);
        }
        return false;
    }
}

export async function updateLanePauseReason(context: AppContext, docId: string, reasonId: string): Promise<void> {
    const currentLane = context.state.currentLanesState[docId];
    if (!currentLane) {
        return;
    }
    if (!canManageRoom(context, currentLane.roomId)) {
        alert("この部屋のレーンは操作できません。");
        return;
    }

    const staffName = getActorDisplayName(context);
    if (!staffName) {
        alert("ログイン名を取得できませんでした。再ログインしてからやり直してください。");
        return;
    }

    if ((currentLane.pauseReasonId || "") === (reasonId || "") && currentLane.staffName === staffName) {
        return;
    }

    try {
        await mutateLaneWithRoomState(context, docId, (liveLane) => {
            if ((liveLane.pauseReasonId || "") === (reasonId || "") && liveLane.staffName === staffName) {
                return null;
            }

            return {
                ...liveLane,
                pauseReasonId: reasonId || null,
                staffName
            };
        });
    } catch (error) {
        console.error("Failed to update pause reason:", error);
    }
}

export async function updateLaneCustomName(context: AppContext, docId: string, newName: string): Promise<void> {
    const { db, paths } = context;
    const currentLane = context.state.currentLanesState[docId];
    if (!currentLane) {
        return;
    }
    if ((currentLane.customName || "") === (newName || "")) {
        return;
    }

    console.log(`Updating custom name for ${docId} to '${newName}'`);
    const docRef = doc(db, paths.lanesCollectionPath, docId);
    try {
        await updateDoc(docRef, {
            customName: newName || null
        });

        const button = document.querySelector(
            `button[data-action='save-custom-name'][data-docid='${docId}']`
        ) as HTMLButtonElement | null;
        if (button) {
            const originalText = button.textContent;
            button.textContent = "保存済";
            button.classList.add("bg-green-500", "hover:bg-green-500");
            button.classList.remove("bg-blue-500", "hover:bg-blue-600");
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove("bg-green-500", "hover:bg-green-500");
                button.classList.add("bg-blue-500", "hover:bg-blue-600");
            }, 1500);
        }
    } catch (error) {
        console.error("Failed to update custom name:", error);
    }
}

export async function saveAdminSettings(context: AppContext): Promise<void> {
    const { db, dom, paths, state } = context;
    console.log("Saving admin settings to Firestore...");

    dom.adminSaveStatus.textContent = "保存中...";
    dom.adminSaveStatus.className = "text-sm text-center mt-3 text-blue-600";

    // ★追加: 入力されたイベント名をローカル設定に反映
    const newName = dom.adminEventNameInput.value.trim();
    state.localAdminConfig.eventName = newName || "名称未設定イベント";

    const configRef = doc(db, paths.configPath);
    try {
        await setDoc(configRef, state.localAdminConfig);
        await updateEventRegistry(context);

        dom.adminSaveStatus.textContent = "設定を保存しました。DB同期を開始します...";
        console.log("Config saved. Explicitly starting migration...");

        if (!state.isDbMigrating) {
            state.isDbMigrating = true;
            console.log("Migration lock ACQUIRED by saveAdminSettings.");

            await checkAndInitDatabase(context, state.localAdminConfig);

            dom.adminSaveStatus.textContent = "DB同期が完了しました。";
        } else {
            console.warn("Migration is already in progress. Skipping call.");
            dom.adminSaveStatus.textContent = "設定を保存しました。(DB同期は他で実行中です)";
        }
    } catch (error) {
        console.error("Failed to save settings:", error);
        dom.adminSaveStatus.textContent = "保存に失敗しました。";
        dom.adminSaveStatus.className = "text-sm text-center mt-3 text-red-500";
    }

    setTimeout(() => {
        dom.adminSaveStatus.textContent = "";
    }, 3000);
}

export async function updateWaitingGroups(context: AppContext, roomId: string, delta: number): Promise<void> {
    if (!canManageRoom(context, roomId)) {
        alert("この部屋の待機組数は更新できません。");
        return;
    }

    if (delta === 0) {
        return;
    }

    const currentWaitingGroups = getDisplayedWaitingGroups(context, roomId);
    const nextWaitingGroups = Math.max(0, currentWaitingGroups + delta);

    if (nextWaitingGroups === currentWaitingGroups) {
        return;
    }

    setWaitingGroupValue(context.state.waitingGroupLocalTargets, roomId, nextWaitingGroups);
    scheduleRender(context);
    scheduleWaitingGroupSync(context, roomId);
}

export function scheduleWaitingGroupSync(context: AppContext, roomId: string, delayMs = 120): void {
    const existingTimer = getWaitingGroupValue(context.state.waitingGroupSyncTimers, roomId);
    if (typeof existingTimer === "number") {
        window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
        delete context.state.waitingGroupSyncTimers[roomId];
        void flushWaitingGroupSync(context, roomId);
    }, delayMs);

    context.state.waitingGroupSyncTimers[roomId] = timerId;
}

export async function flushWaitingGroupSync(context: AppContext, roomId: string): Promise<void> {
    const { db, paths, state } = context;
    if (state.waitingGroupSyncInFlight[roomId]) {
        return;
    }

    const targetWaitingGroups = getWaitingGroupValue(state.waitingGroupLocalTargets, roomId);
    if (typeof targetWaitingGroups !== "number") {
        return;
    }

    const liveWaitingGroups = Number(state.currentRoomState[roomId]?.waitingGroups || 0);
    if (targetWaitingGroups === liveWaitingGroups) {
        delete state.waitingGroupLocalTargets[roomId];
        delete state.waitingGroupInFlightTargets[roomId];
        scheduleRender(context);
        return;
    }

    state.waitingGroupSyncInFlight[roomId] = true;
    setWaitingGroupValue(state.waitingGroupInFlightTargets, roomId, targetWaitingGroups);

    try {
        const roomLaneCount = getRoomLaneCount(context, roomId);
        const docRef = doc(db, paths.roomStateCollectionPath, roomId);
        await runTransaction(db, async (transaction) => {
            const roomStateSnap = await transaction.get(docRef);
            const currentRoomState = roomStateSnap.exists()
                ? normalizeRoomStateData(roomStateSnap.data() as Record<string, unknown>, roomLaneCount)
                : createEmptyRoomState(roomLaneCount);

            if (targetWaitingGroups === Number(currentRoomState.waitingGroups || 0)) {
                return false;
            }

            transaction.set(docRef, {
                ...currentRoomState,
                waitingGroups: targetWaitingGroups,
                totalLanes: roomLaneCount,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return true;
        });
    } catch (error) {
        console.error("Failed to update waiting groups:", error);
    } finally {
        delete state.waitingGroupSyncInFlight[roomId];

        const latestTarget = getWaitingGroupValue(state.waitingGroupLocalTargets, roomId);
        if (typeof latestTarget === "number" && latestTarget !== getWaitingGroupValue(state.waitingGroupInFlightTargets, roomId)) {
            scheduleWaitingGroupSync(context, roomId, 0);
            return;
        }

        delete state.waitingGroupInFlightTargets[roomId];
    }
}

// ★新規追加: イベント情報をレジストリに書き込む関数
export async function updateEventRegistry(context: AppContext): Promise<void> {
    const { db, currentAppId, paths, state } = context;
    try {
        // 現在のAppIDをドキュメントIDとして保存
        const registryRef = doc(db, paths.registryCollectionPath, currentAppId);

        // 部屋名のサマリを作成 (例: "A部屋, B部屋")
        const roomNames = state.localAdminConfig.rooms.map((room) => room.name).join(", ");
        const totalLanes = state.localAdminConfig.rooms.reduce((sum, room) => sum + room.lanes, 0);

        await setDoc(
            registryRef,
            {
                appId: currentAppId,
                roomSummary: roomNames || "部屋なし",
                totalLanes,
                lastUpdated: serverTimestamp()
            },
            { merge: true }
        );

        console.log("Registry updated for:", currentAppId);
    } catch (error) {
        console.error("Failed to update registry:", error);
    }
}

export async function approveAccessRequest(
    context: AppContext,
    uid: string,
    role: RoleId,
    assignedRoomIds: string[]
): Promise<void> {
    const { db, paths, state } = context;
    if (!hasRole(context, ["admin"])) {
        return;
    }

    const request = state.accessRequestsCache.find((item) => item.uid === uid);
    const memberRef = doc(db, paths.accessMembersCollectionPath, uid);
    const requestRef = doc(db, paths.accessRequestsCollectionPath, uid);

    await setDoc(memberRef, {
        uid,
        email: request?.email || "",
        displayName: request?.displayName || "",
        role,
        isActive: true,
        assignedRoomIds: role === "staff" ? assignedRoomIds : [],
        authorizationSource: "manual",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp()
    }, { merge: true });

    await setDoc(requestRef, {
        status: "approved",
        note: null,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

export async function rejectAccessRequest(context: AppContext, uid: string): Promise<void> {
    const { db, paths } = context;
    if (!hasRole(context, ["admin"])) {
        return;
    }

    await setDoc(doc(db, paths.accessRequestsCollectionPath, uid), {
        status: "rejected",
        updatedAt: serverTimestamp()
    }, { merge: true });
}

export async function updateAccessMember(
    context: AppContext,
    uid: string,
    role: RoleId,
    isActive: boolean,
    assignedRoomIds: string[]
): Promise<void> {
    const { db, paths } = context;
    if (!hasRole(context, ["admin"])) {
        return;
    }

    await setDoc(doc(db, paths.accessMembersCollectionPath, uid), {
        role,
        isActive,
        assignedRoomIds: role === "staff" ? assignedRoomIds : [],
        updatedAt: serverTimestamp()
    }, { merge: true });
}
