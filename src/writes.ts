import {
    doc,
    serverTimestamp,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { canManageRoom, getActorDisplayName, hasRole } from "./access.js";
import { checkAndInitDatabase } from "./db-sync.js";
import type { AppContext, RoleId } from "./types.js";

/**
 * レーン担当者がレーンの物理ステータスを更新
 */
export async function updateLaneStatus(context: AppContext, docId: string, newStatus: string): Promise<void> {
    const { db, paths } = context;
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

    console.log(`Updating lane ${docId} to ${newStatus} by ${staffName}`);
    const docRef = doc(db, paths.lanesCollectionPath, docId);

    const updateData: Record<string, unknown> = {
        status: newStatus,
        staffName,
        updatedAt: serverTimestamp()
    };

    // 「休止中」以外になったら、休止理由をリセット
    if (newStatus !== "paused") {
        updateData.pauseReasonId = null;
    }

    // ★修正箇所: 「空き」「準備中」に加えて「休止中」の場合も、客固有のデータ(オプション・備考)をリセットする
    if (newStatus === "available" || newStatus === "preparing" || newStatus === "paused") {
        updateData.selectedOptions = [];
        updateData.receptionNotes = null;
    }

    try {
        await updateDoc(docRef, updateData);
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
    notes: string | null = null
): Promise<void> {
    const { db, paths } = context;
    const currentLane = context.state.currentLanesState[docId];
    if (!currentLane) {
        return;
    }

    const canGuide = hasRole(context, ["admin", "reception"]);
    const canConfirmArrival = hasRole(context, ["admin"]) || canManageRoom(context, currentLane.roomId);

    if (newStatus === "guiding" && !canGuide) {
        alert("受付権限を持つメンバーのみ案内操作できます。");
        return;
    }

    if (newStatus === "available" && !canConfirmArrival) {
        alert("このレーンの到着確認を行う権限がありません。");
        return;
    }

    if (newStatus !== "guiding" && newStatus !== "available" && !hasRole(context, ["admin", "reception"])) {
        return;
    }

    const sameOptions = JSON.stringify(currentLane.selectedOptions || []) === JSON.stringify(options || []);
    const sameNotes = (currentLane.receptionNotes || null) === notes;
    const sameStaffName = (currentLane.staffName || null) === staffName;
    if (currentLane.receptionStatus === newStatus && sameOptions && sameNotes && sameStaffName) {
        return;
    }

    console.log(`Updating reception status ${docId} to ${newStatus}`);
    const docRef = doc(db, paths.lanesCollectionPath, docId);

    const updateData: Record<string, unknown> = {
        receptionStatus: newStatus,
        updatedAt: serverTimestamp()
    };

    if (staffName) {
        updateData.staffName = staffName;
    }

    if (newStatus === "guiding") {
        updateData.selectedOptions = options;
        updateData.receptionNotes = notes;
    }

    if (newStatus === "available" && staffName) {
        updateData.status = "occupied";
    }

    try {
        await updateDoc(docRef, updateData);
    } catch (error) {
        console.error("Failed to update reception status:", error);
    }
}

export async function updateLanePauseReason(context: AppContext, docId: string, reasonId: string): Promise<void> {
    const { db, paths } = context;
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

    console.log(`Updating pause reason ${docId} to ${reasonId} by ${staffName}`);
    const docRef = doc(db, paths.lanesCollectionPath, docId);

    try {
        await updateDoc(docRef, {
            pauseReasonId: reasonId || null,
            staffName,
            updatedAt: serverTimestamp()
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

export async function updateWaitingGroups(context: AppContext, roomId: string, newCount: number): Promise<void> {
    const { db, paths } = context;
    if (!canManageRoom(context, roomId)) {
        alert("この部屋の待機組数は更新できません。");
        return;
    }

    const safeCount = newCount < 0 ? 0 : newCount;
    const currentCount = context.state.currentRoomState[roomId]?.waitingGroups || 0;
    if (currentCount === safeCount) {
        return;
    }

    console.log(`Updating waiting groups for room ${roomId} to ${safeCount}`);

    const docRef = doc(db, paths.roomStateCollectionPath, roomId);

    try {
        await setDoc(
            docRef,
            {
                waitingGroups: safeCount,
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Failed to update waiting groups:", error);
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
