import { collection, doc, getDocs, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { canAccessTab, hasRole } from "./access.js";
import { fetchRegistryItems } from "./firestore.js";
import { renderAdminSettings, renderStaffLaneDashboard } from "./render.js";
import { approveAccessRequest, rejectAccessRequest, saveAdminSettings, updateAccessMember, updateLaneCustomName, updateLanePauseReason, updateLaneStatus, updateReceptionStatus, updateWaitingGroups } from "./writes.js";
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
/**
 * 一覧の描画 (検索フィルタ対応)
 */
function renderEventList(context, dataList) {
    const { currentAppId, dom } = context;
    if (dataList.length === 0) {
        dom.dbEventList.innerHTML = '<p class="p-4 text-center text-gray-400 text-sm">イベントが見つかりません。設定を保存するとここに表示されます。</p>';
        return;
    }
    dom.dbEventList.innerHTML = "";
    dataList.forEach((item) => {
        const isCurrent = item.appId === currentAppId;
        const row = document.createElement("div");
        row.className = `px-4 py-3 flex items-center border-b border-gray-100 hover:bg-gray-50 transition ${isCurrent ? "bg-blue-50" : ""}`;
        row.innerHTML = `
            <div class="w-1/3 pr-2">
                <div class="font-bold text-gray-800 text-sm truncate" title="${item.appId}">
                    ${item.appId}
                    ${isCurrent ? '<span class="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">現在の選択</span>' : ""}
                </div>
            </div>
            <div class="w-1/3 pr-2">
                <div class="text-xs text-gray-600 truncate" title="${item.roomSummary || ""}">
                    ${item.roomSummary || ""}
                </div>
                <div class="text-xs text-gray-400">
                    計 ${item.totalLanes || 0} レーン
                </div>
            </div>
            <div class="w-1/3 text-right">
                <div class="text-xs text-gray-500 mb-1">${item.dateStr || ""}</div>
                ${!isCurrent ? `
                    <button data-action="switch-app-id" data-id="${item.appId}" class="text-xs px-2 py-1 bg-white border border-blue-500 text-blue-600 rounded hover:bg-blue-50">
                        切替
                    </button>
                ` : '<span class="text-xs text-gray-400">選択中</span>'}
            </div>
        `;
        dom.dbEventList.appendChild(row);
    });
}
/**
 * イベント台帳を取得して一覧表示
 */
async function fetchAndRenderEventList(context) {
    await fetchRegistryItems(context);
    renderEventList(context, context.state.registryCache);
}
function validateAppId(currentAppId, id) {
    if (!id) {
        return "IDを入力してください";
    }
    if (id === currentAppId) {
        return "現在のIDと同じです";
    }
    // 日本語もFirebase的にはOKですが、URLパラメータでの扱いやすさを考えると英数字推奨
    if (!/^[a-zA-Z0-9_\-]+$/.test(id)) {
        return "IDは半角英数字、ハイフン(-)、アンダースコア(_) のみを推奨します";
    }
    return null;
}
function collectAssignedRoomIds(root, uid) {
    return Array.from(root.querySelectorAll(`input[data-room-assignment][data-uid="${uid}"]:checked`))
        .map((checkbox) => checkbox.value);
}
async function exportFullBackup(context) {
    const { db, currentAppId, dom, paths, state } = context;
    const originalText = dom.dbExportBtn.textContent || "エクスポート";
    dom.dbExportBtn.disabled = true;
    dom.dbExportBtn.textContent = "データ収集中...";
    try {
        // 1. 設定データ (Config)
        const configData = state.localAdminConfig;
        // 2. レーンデータ (Lanes) - DBから全件取得
        // カスタム名やステータスはここにあります
        const lanesSnap = await getDocs(collection(db, paths.lanesCollectionPath));
        const lanesData = lanesSnap.docs.map((docSnap) => ({
            _id: docSnap.id,
            ...docSnap.data()
        }));
        // 3. 部屋状態 (RoomState) - DBから取得
        // 待機組数はここにあります
        const roomStateSnap = await getDocs(collection(db, paths.roomStateCollectionPath));
        const roomStateData = roomStateSnap.docs.map((docSnap) => ({
            _id: docSnap.id,
            ...docSnap.data()
        }));
        // まとめてオブジェクトにする
        const fullBackupData = {
            meta: {
                version: 1,
                appId: currentAppId,
                type: "full_backup",
                exportedAt: new Date().toISOString()
            },
            config: configData,
            lanes: lanesData,
            roomState: roomStateData
        };
        // JSON変換とダウンロード処理
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackupData, null, 2));
        const downloadAnchorNode = document.createElement("a");
        downloadAnchorNode.setAttribute("href", dataStr);
        // 日時付きファイル名
        const now = new Date();
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") + "_" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0");
        downloadAnchorNode.setAttribute("download", `line_omega_FULL_backup_${currentAppId}_${dateStr}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }
    catch (error) {
        console.error("Export failed:", error);
        alert("エクスポート中にエラーが発生しました。コンソールを確認してください。");
    }
    finally {
        dom.dbExportBtn.disabled = false;
        dom.dbExportBtn.textContent = originalText;
    }
}
async function importBackup(context, file) {
    const { db, currentAppId, dom, paths, state } = context;
    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
        try {
            const result = loadEvent.target?.result;
            if (typeof result !== "string") {
                throw new Error("ファイルの読み込み結果が文字列ではありません。");
            }
            const json = JSON.parse(result);
            // バックアップ形式の判定 (lanesデータが含まれているか？)
            const isFullBackup = Boolean(json.lanes && json.roomState);
            // Configの検証
            const configToCheck = isFullBackup ? json.config : json;
            if (!configToCheck.rooms || !Array.isArray(configToCheck.rooms)) {
                alert("無効なファイルです。(roomsデータが見つかりません)");
                return;
            }
            const confirmMsg = isFullBackup
                ? "【完全復元】\nこのバックアップには「レーン名」「待機状況」なども含まれています。\n現在のデータを全て削除し、このファイルの状態に完全に戻しますか？"
                : "【設定のみ復元】\nこれは古い形式の設定ファイルです。\n現在の設定を上書きしますが、レーン名などは復元されません。よろしいですか？";
            if (!confirm(confirmMsg)) {
                return;
            }
            console.log("Starting restore process...");
            if (isFullBackup) {
                // === A. 完全復元プロセス ===
                const batch = writeBatch(db);
                // 1. 既存データの削除 (Batch処理)
                const currentLanes = await getDocs(collection(db, paths.lanesCollectionPath));
                currentLanes.forEach((docSnap) => batch.delete(docSnap.ref));
                const currentRoomStates = await getDocs(collection(db, paths.roomStateCollectionPath));
                currentRoomStates.forEach((docSnap) => batch.delete(docSnap.ref));
                // 2. データの書き戻し
                state.localAdminConfig = cloneJson(json.config);
                batch.set(doc(db, paths.configPath), state.localAdminConfig);
                json.lanes.forEach((laneData) => {
                    const docId = laneData._id;
                    const { _id, ...data } = laneData;
                    data.updatedAt = serverTimestamp();
                    batch.set(doc(db, paths.lanesCollectionPath, docId), data);
                });
                json.roomState.forEach((roomStateData) => {
                    const docId = roomStateData._id;
                    const { _id, ...data } = roomStateData;
                    data.updatedAt = serverTimestamp();
                    batch.set(doc(db, paths.roomStateCollectionPath, docId), data);
                });
                batch.set(doc(db, paths.registryCollectionPath, currentAppId), {
                    appId: currentAppId,
                    roomSummary: state.localAdminConfig.rooms.map((room) => room.name).join(", "),
                    totalLanes: state.localAdminConfig.rooms.reduce((sum, room) => sum + room.lanes, 0),
                    lastUpdated: serverTimestamp()
                }, { merge: true });
                await batch.commit();
            }
            else {
                // === B. 旧形式(設定のみ)復元 ===
                state.localAdminConfig = cloneJson(json);
                await saveAdminSettings(context);
            }
            alert("復元が完了しました！画面をリロードします。");
            window.location.reload();
        }
        catch (error) {
            console.error("Import error:", error);
            const message = error instanceof Error ? error.message : String(error);
            alert("ファイルの読み込みに失敗しました: " + message);
        }
        finally {
            dom.dbImportFile.value = "";
        }
    };
    reader.readAsText(file);
}
async function copyAndSwitchAppId(context, newId) {
    const { db, currentAppId, dom, paths, state } = context;
    if (!confirm(`現在のデータを '${newId}' に複製して移動しますか？\n(実質的なリネーム操作です)`)) {
        return;
    }
    const originalHtml = dom.btnCopySwitch.innerHTML;
    dom.btnCopySwitch.disabled = true;
    dom.btnCopySwitch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 複製中...';
    try {
        // --- データの読み出し (Copy Source) ---
        // 1. Config (メモリ上の最新データを使用)
        const sourceConfig = state.localAdminConfig;
        // 2. Lanes (DBから取得)
        const sourceLanesSnap = await getDocs(collection(db, paths.lanesCollectionPath));
        // 3. RoomState (DBから取得)
        const sourceRoomStateSnap = await getDocs(collection(db, paths.roomStateCollectionPath));
        // --- データの書き込み (Copy Target) ---
        // 新しいパスを構築
        const newConfigPath = `/artifacts/${newId}/public/data/config/appConfig`;
        const newLanesPath = `/artifacts/${newId}/public/data/lanes`;
        const newRoomStatePath = `/artifacts/${newId}/public/data/roomState`;
        const newRegistryPath = "sys_registry";
        const batch = writeBatch(db);
        let opCount = 0;
        // 1. Config書き込み
        batch.set(doc(db, newConfigPath), sourceConfig);
        opCount++;
        // 2. Lanes書き込み
        sourceLanesSnap.forEach((docSnap) => {
            const data = docSnap.data();
            batch.set(doc(db, newLanesPath, docSnap.id), data);
            opCount++;
        });
        // 3. RoomState書き込み
        sourceRoomStateSnap.forEach((docSnap) => {
            const data = docSnap.data();
            batch.set(doc(db, newRoomStatePath, docSnap.id), data);
            opCount++;
        });
        // 4. レジストリ登録 (新しいID用)
        batch.set(doc(db, newRegistryPath, newId), {
            appId: newId,
            roomSummary: sourceConfig.rooms.map((room) => room.name).join(", "),
            totalLanes: sourceConfig.rooms.reduce((sum, room) => sum + room.lanes, 0),
            lastUpdated: serverTimestamp()
        });
        opCount++;
        console.log(`Cloning ${opCount} documents from ${currentAppId} to ${newId}...`);
        await batch.commit();
        alert(`複製が完了しました！\n新しいID: ${newId} に移動します。`);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("app_id", newId);
        window.location.href = newUrl.toString();
    }
    catch (error) {
        console.error("Copy failed:", error);
        const message = error instanceof Error ? error.message : String(error);
        alert("複製中にエラーが発生しました。\n" + message);
        dom.btnCopySwitch.disabled = false;
        dom.btnCopySwitch.innerHTML = originalHtml;
    }
}
// --- イベントリスナー設定 ---
export function setupEventListeners(context) {
    const { currentAppId, dom, state } = context;
    dom.tabs.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const button = target.closest("button[data-tab]");
        if (!button) {
            return;
        }
        if (button.classList.contains("active")) {
            return;
        }
        const tabId = button.dataset.tab;
        if (!tabId) {
            return;
        }
        if (!canAccessTab(context, tabId)) {
            event.preventDefault();
            alert("この画面を開く権限がありません。");
            return;
        }
        state.activeTab = tabId;
        if (state.activeTab === "database" && hasRole(context, ["admin"])) {
            void fetchAndRenderEventList(context);
        }
        dom.tabs.querySelectorAll(".tab-button").forEach((tabButton) => {
            tabButton.classList.remove("active");
        });
        button.classList.add("active");
        dom.tabContents.querySelectorAll(".tab-pane").forEach((pane) => {
            if (pane.id === `tab-${state.activeTab}`) {
                pane.classList.remove("hidden");
            }
            else {
                pane.classList.add("hidden");
            }
        });
    });
    // --- DB管理画面: 検索・リフレッシュ ---
    dom.dbSearchInput.addEventListener("input", (event) => {
        const target = event.target;
        const term = target.value.toLowerCase();
        const filtered = state.registryCache.filter((item) => item.appId.toLowerCase().includes(term) ||
            (item.roomSummary && item.roomSummary.toLowerCase().includes(term)));
        renderEventList(context, filtered);
    });
    dom.dbRefreshBtn.addEventListener("click", () => {
        void fetchAndRenderEventList(context);
    });
    // --- DB管理画面: イベント切替 (イベント移譲) ---
    dom.dbEventList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const button = target.closest('button[data-action="switch-app-id"]');
        if (!button) {
            return;
        }
        const targetId = button.dataset.id;
        if (!targetId) {
            return;
        }
        if (confirm(`イベントID '${targetId}' に切り替えますか？\n画面がリロードされます。`)) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set("app_id", targetId);
            window.location.href = newUrl.toString();
        }
    });
    // --- DB管理画面: エクスポート (フルバックアップ) ---
    dom.dbExportBtn.addEventListener("click", () => {
        void exportFullBackup(context);
    });
    // --- DB管理画面: インポート (フルリストア対応) ---
    dom.dbImportFile.addEventListener("change", (event) => {
        const target = event.target;
        const file = target.files?.[0];
        if (!file) {
            return;
        }
        void importBackup(context, file);
    });
    // --- 8. イベントID管理 (リネーム・複製機能) ---
    dom.lblCurrentAppId.textContent = currentAppId;
    // A. 空で移動 (新規作成)
    dom.btnSwitchOnly.addEventListener("click", () => {
        const newId = dom.inputNewAppId.value.trim();
        const error = validateAppId(currentAppId, newId);
        if (error) {
            alert(error);
            return;
        }
        if (confirm(`新しいイベントID '${newId}' に切り替えますか？\n現在のデータはコピーされず、初期状態で始まります。`)) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set("app_id", newId);
            window.location.href = newUrl.toString();
        }
    });
    // B. コピーして移動 (複製・リネーム)
    dom.btnCopySwitch.addEventListener("click", () => {
        const newId = dom.inputNewAppId.value.trim();
        const error = validateAppId(currentAppId, newId);
        if (error) {
            alert(error);
            return;
        }
        void copyAndSwitchAppId(context, newId);
    });
    dom.receptionList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const button = target.closest("button");
        if (!button) {
            return;
        }
        const action = button.dataset.action;
        if (action === "set-guiding") {
            const docId = button.dataset.docid;
            if (!docId) {
                return;
            }
            const optionsTargetId = button.dataset.optionsTarget;
            const optionsUI = optionsTargetId ? document.getElementById(optionsTargetId) : null;
            const notesTargetId = button.dataset.notesTarget;
            const notesUI = notesTargetId ? document.getElementById(notesTargetId) : null;
            const selectedOptions = [];
            let notes = null;
            if (optionsUI) {
                optionsUI.querySelectorAll('input[type="checkbox"]:checked').forEach((checkbox) => {
                    selectedOptions.push(checkbox.value);
                });
            }
            if (notesUI) {
                const notesInput = notesUI.querySelector("input");
                if (notesInput instanceof HTMLInputElement && notesInput.value.trim() !== "") {
                    notes = notesInput.value.trim();
                }
            }
            void updateReceptionStatus(context, docId, "guiding", null, selectedOptions, notes);
        }
        if (action === "toggle-options") {
            const targetId = button.dataset.target;
            if (!targetId) {
                console.error("Button is missing data-target attribute:", button);
                return;
            }
            const targetUI = document.getElementById(targetId);
            if (!targetUI?.classList) {
                console.error(`Element not found for targetId: ${targetId}`);
                return;
            }
            targetUI.classList.toggle("hidden");
            button.textContent = targetUI.classList.contains("hidden") ? "＋ オプション選択" : "－ オプションを閉じる";
        }
    });
    dom.staffRoomSelect.addEventListener("change", (event) => {
        const target = event.target;
        renderStaffLaneDashboard(context, target.value);
    });
    dom.staffLaneDashboard.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const button = target.closest("button");
        if (!button) {
            return;
        }
        const action = button.dataset.action;
        if (action === "set-lane-status" || action === "confirm-arrival") {
            const docId = button.dataset.docid;
            if (!docId) {
                return;
            }
            if (action === "set-lane-status") {
                const status = button.dataset.status;
                if (status) {
                    void updateLaneStatus(context, docId, status);
                }
            }
            if (action === "confirm-arrival") {
                const staffName = dom.staffNameInput.value.trim() || null;
                if (!staffName) {
                    console.warn("担当者名を入力してください。");
                    dom.staffNameInput.focus();
                    dom.staffNameInput.classList.add("border-red-500", "ring-red-500");
                    return;
                }
                dom.staffNameInput.classList.remove("border-red-500", "ring-red-500");
                void updateReceptionStatus(context, docId, "available", staffName, []);
            }
        }
        const roomId = button.dataset.roomid;
        if (!roomId) {
            return;
        }
        const currentState = state.currentRoomState[roomId] || { waitingGroups: 0 };
        const currentWaitingGroups = currentState.waitingGroups || 0;
        if (action === "inc-wait") {
            void updateWaitingGroups(context, roomId, currentWaitingGroups + 1);
        }
        if (action === "dec-wait" && currentWaitingGroups > 0) {
            void updateWaitingGroups(context, roomId, currentWaitingGroups - 1);
        }
    });
    dom.staffLaneDashboard.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) {
            return;
        }
        if (target.dataset.action !== "set-pause-reason") {
            return;
        }
        const docId = target.dataset.docid;
        const reasonId = target.value;
        if (docId) {
            void updateLanePauseReason(context, docId, reasonId);
        }
    });
    // 管理設定 (部屋・オプションのローカル編集)
    dom.adminAddRoomBtn.addEventListener("click", () => {
        const newName = dom.adminNewRoomInput.value.trim();
        const newLanes = parseInt(dom.adminNewRoomLanesInput.value, 10) || 1;
        if (!newName) {
            return;
        }
        const newId = `room_${Date.now()}`;
        state.localAdminConfig.rooms.push({ id: newId, name: newName, lanes: newLanes });
        dom.adminNewRoomInput.value = "";
        dom.adminNewRoomLanesInput.value = "1";
        renderAdminSettings(context);
    });
    dom.adminAddOptionBtn.addEventListener("click", () => {
        const newName = dom.adminNewOptionInput.value.trim();
        if (!newName) {
            return;
        }
        const newId = `opt_${Date.now()}`;
        state.localAdminConfig.options.push({ id: newId, name: newName });
        dom.adminNewOptionInput.value = "";
        renderAdminSettings(context);
    });
    dom.adminAddPauseReasonBtn.addEventListener("click", () => {
        const newName = dom.adminNewPauseReasonInput.value.trim();
        if (!newName) {
            return;
        }
        const newId = `reason_${Date.now()}`;
        if (!state.localAdminConfig.pauseReasons) {
            state.localAdminConfig.pauseReasons = [];
        }
        state.localAdminConfig.pauseReasons.push({ id: newId, name: newName });
        dom.adminNewPauseReasonInput.value = "";
        renderAdminSettings(context);
    });
    // ----------------------------------------------------
    // 管理設定タブ全体のイベントリスナー (イベント移譲)
    // ----------------------------------------------------
    dom.tabAdmin.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const button = target.closest("button");
        const actionButton = button?.dataset.action ?? null;
        if (actionButton === "approve-access-request" && button) {
            const uid = button.dataset.uid;
            if (!uid) {
                return;
            }
            const requestCard = button.closest('[data-request-card]');
            const roleSelect = requestCard?.querySelector(`select[data-role-input][data-uid="${uid}"]`);
            const role = (roleSelect?.value || "staff");
            const assignedRoomIds = requestCard ? collectAssignedRoomIds(requestCard, uid) : [];
            void approveAccessRequest(context, uid, role, assignedRoomIds);
            return;
        }
        if (actionButton === "reject-access-request" && button) {
            const uid = button.dataset.uid;
            if (!uid) {
                return;
            }
            void rejectAccessRequest(context, uid);
            return;
        }
        if (actionButton === "save-access-member" && button) {
            const uid = button.dataset.uid;
            if (!uid) {
                return;
            }
            const memberCard = button.closest('[data-member-card]');
            const roleSelect = memberCard?.querySelector(`select[data-role-input][data-uid="${uid}"]`);
            const activeInput = memberCard?.querySelector(`input[data-active-input][data-uid="${uid}"]`);
            const role = (roleSelect?.value || "staff");
            const isActive = activeInput?.checked ?? true;
            const assignedRoomIds = memberCard ? collectAssignedRoomIds(memberCard, uid) : [];
            void updateAccessMember(context, uid, role, isActive, assignedRoomIds);
            return;
        }
        // ★追加: 部屋の並び替え処理 (上へ)
        if (actionButton === "move-room-up" && button) {
            const index = parseInt(button.dataset.index || "-1", 10);
            if (index > 0) {
                const rooms = state.localAdminConfig.rooms;
                [rooms[index - 1], rooms[index]] = [rooms[index], rooms[index - 1]];
                renderAdminSettings(context);
            }
            return;
        }
        // ★追加: 部屋の並び替え処理 (下へ)
        if (actionButton === "move-room-down" && button) {
            const index = parseInt(button.dataset.index || "-1", 10);
            const rooms = state.localAdminConfig.rooms;
            if (index >= 0 && index < rooms.length - 1) {
                [rooms[index], rooms[index + 1]] = [rooms[index + 1], rooms[index]];
                renderAdminSettings(context);
            }
            return;
        }
        // --- 既存の処理 (削除系) ---
        const id = button?.dataset.id ?? null;
        if (actionButton === "delete-room" && id) {
            if (!confirm("この部屋を削除しますか？\n(保存ボタンを押すまで確定しません)")) {
                return;
            }
            state.localAdminConfig.rooms = state.localAdminConfig.rooms.filter((room) => room.id !== id);
            renderAdminSettings(context);
        }
        if (actionButton === "delete-option" && id) {
            state.localAdminConfig.options = state.localAdminConfig.options.filter((option) => option.id !== id);
            renderAdminSettings(context);
        }
        if (actionButton === "delete-pause-reason" && id) {
            state.localAdminConfig.pauseReasons = state.localAdminConfig.pauseReasons.filter((reason) => reason.id !== id);
            renderAdminSettings(context);
        }
        // --- 既存の処理 (レーン名保存) ---
        if (actionButton === "save-custom-name" && button) {
            const docId = button.dataset.docid;
            if (!docId) {
                return;
            }
            const wrapper = button.closest(".flex");
            const inputElement = wrapper?.querySelector('input[data-action="edit-custom-name"]');
            if (inputElement instanceof HTMLInputElement) {
                void updateLaneCustomName(context, docId, inputElement.value.trim());
            }
        }
    });
    dom.tabAdmin.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
            return;
        }
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (!action || !id) {
            return;
        }
        if (action === "edit-room-name") {
            const room = state.localAdminConfig.rooms.find((item) => item.id === id);
            if (room) {
                room.name = target.value;
            }
        }
        if (action === "edit-room-lanes") {
            const room = state.localAdminConfig.rooms.find((item) => item.id === id);
            if (room) {
                room.lanes = parseInt(target.value, 10) || 1;
            }
        }
        if (action === "edit-option-name") {
            const option = state.localAdminConfig.options.find((item) => item.id === id);
            if (option) {
                option.name = target.value;
            }
        }
        if (action === "edit-pause-reason-name") {
            const reason = state.localAdminConfig.pauseReasons.find((item) => item.id === id);
            if (reason) {
                reason.name = target.value;
            }
        }
    });
    // 6. 管理設定 (保存ボタン)
    dom.adminSaveSettingsBtn.addEventListener("click", () => {
        void saveAdminSettings(context);
    });
}
