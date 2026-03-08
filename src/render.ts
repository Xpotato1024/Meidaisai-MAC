import { updateReceptionStatus } from "./writes.js";
import type { AppConfig, AppContext, LaneData } from "./types.js";

function getAllLanes(context: AppContext): Array<{ docId: string; data: LaneData }> {
    return Object.entries(context.state.currentLanesState).map(([docId, data]) => ({
        docId,
        data
    }));
}

// --- UI描画 (Render) ---

export function renderAllUI(context: AppContext): void {
    renderReceptionList(context);
    renderStaffRoomSelect(context);
    renderStaffLaneDashboard(context, context.dom.staffRoomSelect.value);
    renderAdminSettings(context);
    renderAdminLaneNames(context);

    // ★追加: サマリーバーの描画
    renderRoomSummaryBar(context);
}

/**
 * ★新規追加: 全部屋の簡易状況を表示するサマリーバー
 * (待機がある部屋は赤、空きがある部屋は緑、満室はグレーで表示)
 */
function renderRoomSummaryBar(context: AppContext): void {
    const { dom, state } = context;
    const summaryBar = dom.roomSummaryBar;
    summaryBar.innerHTML = "";

    // データを整形
    const allLanes = Object.values(state.currentLanesState);

    state.dynamicAppConfig.rooms.forEach((room) => {
        // 1. 待機組数を取得
        const roomState = state.currentRoomState[room.id] || { waitingGroups: 0 };
        const waiting = roomState.waitingGroups || 0;

        // 2. 空きレーンがあるかチェック (statusが 'available' のもの)
        const roomLanes = allLanes.filter((lane) => lane.roomId === room.id);
        const availableCount = roomLanes.filter((lane) => lane.status === "available").length;

        // 3. 状態判定とスタイル決定
        let statusClass = "";
        let iconHtml = "";
        let textHtml = "";

        if (waiting > 0) {
            // 待機あり (赤色・点滅) -> 最優先
            statusClass = "bg-red-500 text-white border-red-600 animate-pulse shadow-md";
            iconHtml = '<i class="fa-solid fa-users mr-1"></i>';
            textHtml = `待機: ${waiting}組`;
        } else if (availableCount > 0) {
            // 待機なし & 空きあり (緑色) -> 案内チャンス
            statusClass = "bg-emerald-500 text-white border-emerald-600 shadow-sm";
            iconHtml = '<i class="fa-regular fa-circle-check mr-1"></i>';
            textHtml = `空き: ${availableCount}`;
        } else {
            // 待機なし & 空きなし (満室・グレー)
            statusClass = "bg-gray-100 text-gray-500 border-gray-300";
            iconHtml = '<i class="fa-solid fa-ban mr-1"></i>';
            textHtml = "満室";
        }

        // 4. チップを作成
        const chip = document.createElement("div");
        // クリックしたらその部屋までスクロールする機能をつけると便利です
        chip.className = `flex-grow sm:flex-grow-0 px-3 py-2 rounded-md border text-xs font-bold flex items-center justify-center cursor-pointer transition transform active:scale-95 ${statusClass}`;
        chip.innerHTML = `
            <span class="mr-2 opacity-90">${room.name}</span>
            <span class="flex items-center bg-black/10 px-2 py-0.5 rounded-full">
                ${iconHtml} ${textHtml}
            </span>
        `;

        // クリックで該当の部屋カードまでスクロール (受付タブが開いている場合)
        chip.onclick = () => {
            // 受付タブに切り替え
            const receptionButton = document.querySelector('button[data-tab="reception"]') as HTMLButtonElement | null;
            if (receptionButton && !receptionButton.classList.contains("active")) {
                receptionButton.click();
            }

            // 少し遅らせてスクロール (タブ切り替え描画待ち)
            setTimeout(() => {
                // ダッシュボード内のカードを探す (簡易的な実装として、roomNameを含む要素を探す)
                const cards = document.querySelectorAll(".room-dashboard-card h3");
                for (const heading of cards) {
                    if (heading.textContent === room.name) {
                        const card = heading.closest(".room-dashboard-card") as HTMLElement | null;
                        if (!card) {
                            break;
                        }
                        card.scrollIntoView({ behavior: "smooth", block: "center" });
                        // ハイライト演出
                        card.classList.add("ring-4", "ring-indigo-400");
                        setTimeout(() => card.classList.remove("ring-4", "ring-indigo-400"), 1000);
                        break;
                    }
                }
            }, 100);
        };

        summaryBar.appendChild(chip);
    });
}

/**
 * 全画面共通のヘッダー（イベント名）を更新
 */
export function updateGlobalHeader(context: AppContext, config: AppConfig): void {
    const { currentAppId, dom } = context;

    dom.globalEventNameText.textContent = config.eventName || "名称未設定";
    dom.globalAppIdText.textContent = `ID: ${currentAppId}`;
    dom.globalEventDisplay.classList.remove("hidden");
    document.title = `${config.eventName} - LINEΩ`;
}

/**
 * 受付用ビュー (ダッシュボードUI - 濃い色・詳細表示版)
 */
function renderReceptionList(context: AppContext): void {
    const { dom, state } = context;
    const config = state.dynamicAppConfig;

    dom.receptionList.innerHTML = "";
    dom.receptionList.className = "dashboard-grid";

    if (config.rooms.length === 0) {
        dom.receptionList.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500 bg-white rounded-lg shadow">部屋設定がありません。「管理設定」で部屋を登録してください。</div>';
        return;
    }

    const allLanes = getAllLanes(context);

    config.rooms.forEach((room) => {
        const roomElement = document.createElement("div");
        roomElement.className = "room-dashboard-card";

        const currentState = state.currentRoomState[room.id] || { waitingGroups: 0 };
        const waitingGroups = currentState.waitingGroups || 0;
        const headerElement = document.createElement("div");
        headerElement.className = "bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center";
        const waitBadgeClass = waitingGroups > 0 ? "wait-exists" : "wait-zero";

        headerElement.innerHTML = `
            <div>
                <h3 class="text-xl font-bold text-gray-800">${room.name}</h3>
                <p class="text-xs text-gray-500 mt-1">全 ${room.lanes} レーン</p>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-xs font-bold text-gray-400 mb-1">待機</span>
                <div class="${waitBadgeClass} wait-badge-large text-gray-800">
                    ${waitingGroups > 0 ? `${waitingGroups}組` : "0"}
                </div>
            </div>
        `;
        roomElement.appendChild(headerElement);

        const lanesContainer = document.createElement("div");
        lanesContainer.className = "p-4 grid grid-cols-3 gap-3 min-h-[50vh]";
        const roomLanes = allLanes
            .filter((lane) => lane.data.roomId === room.id)
            .sort((left, right) => left.data.laneNum - right.data.laneNum);

        if (roomLanes.length === 0) {
            lanesContainer.innerHTML = '<p class="col-span-full text-center text-xs text-gray-400 py-4">レーン未設定</p>';
        }

        roomLanes.forEach((lane) => {
            const docId = lane.docId;
            const laneData = lane.data;
            const laneName = laneData.customName || `${laneData.laneNum}`;

            let tileClass = "";
            let statusIcon = "";
            let statusText = "";
            let isClickable = false;
            let additionalInfo = "";

            if (laneData.receptionStatus === "guiding") {
                tileClass = "tile-guiding";
                statusIcon = '<i class="fa-solid fa-person-walking-arrow-right fa-beat-fade"></i>';
                statusText = "案内中";
            } else {
                switch (laneData.status) {
                    case "available":
                        tileClass = "tile-available";
                        statusIcon = '<i class="fa-regular fa-circle-check text-2xl mb-1"></i>';
                        statusText = "空き";
                        isClickable = true;
                        break;
                    case "occupied":
                        tileClass = "tile-occupied";
                        statusIcon = '<i class="fa-solid fa-gamepad"></i>';
                        statusText = "使用中";
                        break;
                    case "preparing":
                        tileClass = "tile-preparing";
                        statusIcon = '<i class="fa-solid fa-wrench"></i>';
                        statusText = "準備中";
                        break;
                    case "paused":
                        tileClass = "tile-paused";
                        statusIcon = '<i class="fa-solid fa-ban"></i>';
                        statusText = "休止中";
                        if (laneData.pauseReasonId) {
                            const reason = config.pauseReasons.find((item) => item.id === laneData.pauseReasonId);
                            if (reason) {
                                additionalInfo = `<span class="text-[10px] bg-black/20 px-1 rounded mt-1 truncate max-w-full">${reason.name}</span>`;
                            }
                        }
                        break;
                    default:
                        tileClass = "bg-gray-400 text-white";
                }
            }

            const laneTile = document.createElement("div");
            laneTile.className = `lane-tile ${tileClass}`;

            let innerContent = `
                <div class="font-bold text-lg leading-none mb-1 shadow-sm" style="text-shadow: 1px 1px 2px rgba(0,0,0,0.3);">${laneName}</div>
                <div class="text-xs flex flex-col items-center">
                    ${statusIcon}
                    <span class="font-bold">${statusText}</span>
                    ${additionalInfo}
                </div>
            `;

            // オプション等のバッジ
            if (laneData.selectedOptions?.length) {
                innerContent += '<div class="absolute top-1 right-1 text-[10px] font-bold text-blue-700 bg-white rounded px-1 shadow">Op</div>';
            }
            if (laneData.receptionNotes) {
                innerContent += '<div class="absolute top-1 left-1 text-[10px] font-bold text-yellow-700 bg-yellow-100 rounded px-1 shadow">Memo</div>';
            }

            laneTile.innerHTML = innerContent;

            if (isClickable) {
                laneTile.onclick = (event) => {
                    event.stopPropagation();
                    void openReceptionLaneModal(context, docId);
                };
            }

            lanesContainer.appendChild(laneTile);
        });

        roomElement.appendChild(lanesContainer);
        dom.receptionList.appendChild(roomElement);
    });
}

/**
 * ★新規追加: 受付画面でレーンタイルをクリックした際に表示されるモーダル
 * (レーン担当者画面のmodalと似た構造ですが、受付用は操作に特化させます)
 */
export async function openReceptionLaneModal(context: AppContext, laneDocId: string): Promise<void> {
    const { dom, state } = context;
    const laneData = state.currentLanesState[laneDocId];
    if (!laneData) {
        alert("レーン情報が見つかりません。");
        return;
    }

    const config = state.dynamicAppConfig;

    // モーダルのタイトル設定
    const laneName = laneData.customName || `レーン ${laneData.laneNum}`;
    dom.receptionModalTitle.textContent = `${laneName}へ案内`;

    // モーダルコンテンツを構築
    dom.receptionModalContent.innerHTML = `
        <div class="mb-4">
            <h4 class="text-sm font-bold text-gray-700 mb-2">オプションを選択:</h4>
            <div id="reception-modal-options" class="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                ${config.options.length > 0 ?
                    config.options.map((option) => `
                        <label class="flex items-center space-x-2 text-sm text-gray-800 mb-1 cursor-pointer">
                            <input type="checkbox" class="reception-opt-chk accent-blue-600" value="${option.name}"
                                ${laneData.selectedOptions && laneData.selectedOptions.includes(option.name) ? "checked" : ""}>
                            <span class="truncate">${option.name}</span>
                        </label>
                    `).join("") :
                    '<p class="text-xs text-gray-400">オプションは設定されていません。</p>'
                }
            </div>
        </div>

        <div class="mb-6">
            <label for="reception-modal-notes" class="block text-sm font-bold text-gray-700 mb-2">備考 (任意):</label>
            <input type="text" id="reception-modal-notes" 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" 
                   placeholder="例: 人数、特徴など (任意)"
                   value="${laneData.receptionNotes || ""}">
        </div>

        <button id="reception-modal-start-btn" 
                class="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 transition">
            <i class="fa-solid fa-person-walking-arrow-right mr-2"></i> 案内中にする
        </button>
    `;

    // モーダルを表示
    dom.receptionLaneModal.classList.remove("hidden");

    // イベントリスナー設定
    dom.receptionModalCloseBtn.onclick = () => dom.receptionLaneModal.classList.add("hidden");
    dom.receptionLaneModal.onclick = (event) => {
        if (event.target === dom.receptionLaneModal) {
            dom.receptionLaneModal.classList.add("hidden");
        }
    };

    const startButton = document.getElementById("reception-modal-start-btn") as HTMLButtonElement | null;
    const notesInput = document.getElementById("reception-modal-notes") as HTMLInputElement | null;
    if (!startButton || !notesInput) {
        return;
    }

    startButton.onclick = async () => {
        startButton.disabled = true;
        startButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 処理中...';

        const selectedOptions = Array.from(document.querySelectorAll(".reception-opt-chk:checked"))
            .map((checkbox) => (checkbox as HTMLInputElement).value);
        const receptionNotes = notesInput.value.trim() || null;

        // 案内ステータスを更新
        await updateReceptionStatus(context, laneDocId, "guiding", null, selectedOptions, receptionNotes);

        dom.receptionLaneModal.classList.add("hidden");
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fa-solid fa-person-walking-arrow-right mr-2"></i> 案内中にする';
    };
}

/**
 * レーン担当用ビュー (部屋選択) を描画
 */
export function renderStaffRoomSelect(context: AppContext): void {
    const { dom, state } = context;
    const currentSelectedRoom = dom.staffRoomSelect.value;

    dom.staffRoomSelect.innerHTML = '<option value="">--- 部屋を選択してください ---</option>';
    state.dynamicAppConfig.rooms.forEach((room) => {
        const option = document.createElement("option");
        option.value = room.id;
        option.textContent = room.name;
        dom.staffRoomSelect.appendChild(option);
    });

    if (currentSelectedRoom) {
        dom.staffRoomSelect.value = currentSelectedRoom;
    }
}

/**
 * レーン担当用ビュー (ダッシュボード) を描画
 */
export function renderStaffLaneDashboard(context: AppContext, selectedRoomId: string): void {
    const { dom, state } = context;
    const config = state.dynamicAppConfig;
    dom.staffLaneDashboard.innerHTML = "";

    if (!selectedRoomId) {
        dom.staffLaneDashboard.innerHTML = '<p class="text-center text-gray-500">上記で担当する部屋を選択してください。</p>';
        return;
    }

    const currentState = state.currentRoomState[selectedRoomId] || { waitingGroups: 0 };
    const currentWaitingGroups = currentState.waitingGroups || 0;

    const waitControlElement = document.createElement("div");
    waitControlElement.className = "bg-white p-4 rounded-lg shadow border border-gray-200 mb-6";
    waitControlElement.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-800 mb-3">待機組数 管理</h3>
        <div class="flex items-center justify-center space-x-4">
            <button data-action="dec-wait" data-roomid="${selectedRoomId}"
                    class="px-5 py-3 bg-red-500 text-white font-bold rounded-lg shadow-md hover:bg-red-600 active:scale-95 transition-transform ${currentWaitingGroups === 0 ? "opacity-50 cursor-not-allowed" : ""}"
                    ${currentWaitingGroups === 0 ? "disabled" : ""}>
                <i class="fa-solid fa-minus"></i>
            </button>
            <div class="text-4xl font-bold text-blue-600 w-20 text-center">${currentWaitingGroups}</div>
            <button data-action="inc-wait" data-roomid="${selectedRoomId}"
                    class="px-5 py-3 bg-green-500 text-white font-bold rounded-lg shadow-md hover:bg-green-600 active:scale-95 transition-transform">
                <i class="fa-solid fa-plus"></i>
            </button>
        </div>
        <p class="text-center text-sm text-gray-500 mt-2">この部屋の待機組数を更新します</p>
    `;
    dom.staffLaneDashboard.appendChild(waitControlElement);

    const roomLanes = getAllLanes(context)
        .filter((lane) => lane.data.roomId === selectedRoomId)
        .sort((left, right) => left.data.laneNum - right.data.laneNum);

    if (roomLanes.length === 0) {
        dom.staffLaneDashboard.innerHTML += '<p class="text-center text-gray-500">この部屋にはレーンがありません。</p>';
        return;
    }

    const roomGrid = document.createElement("div");
    roomGrid.className = "grid grid-cols-1 md:grid-cols-2 gap-4";

    roomLanes.forEach((lane) => {
        const docId = lane.docId;
        const laneData = lane.data;

        const laneElement = document.createElement("div");
        laneElement.className = "lane-card";

        const laneDisplayName = laneData.customName || `レーン ${laneData.laneNum}`;
        const staffNameDisplay = laneData.staffName ? `担当: ${laneData.staffName}` : "担当: ---";
        const laneStatusConfig = config.laneStatuses.find((status) => status.id === laneData.status) || { name: "不明" };
        const receptionStatusConfig = config.receptionStatuses.find((status) => status.id === laneData.receptionStatus) || { name: "不明" };

        let receptionStatusDisplay = receptionStatusConfig.name;
        let receptionStatusClass = "text-gray-500";
        let arrivalButton = "";
        let optionsDisplay = "";
        let notesDisplay = "";

        if (laneData.status !== "available" && laneData.receptionStatus === "available") {
            let statusName = laneStatusConfig.name;
            if (laneData.status === "paused" && laneData.pauseReasonId) {
                const reason = config.pauseReasons.find((item) => item.id === laneData.pauseReasonId);
                if (reason) {
                    statusName = `休止中 (${reason.name})`;
                }
            }
            receptionStatusDisplay = `(${statusName})`;
        }

        if (laneData.receptionStatus === "guiding") {
            receptionStatusDisplay = "お客様 案内中";
            receptionStatusClass = "text-blue-600 font-bold animate-pulse";
            arrivalButton = `
                <button data-action="confirm-arrival" data-docid="${docId}"
                        class="w-full mt-3 px-3 py-2 text-sm font-medium text-white bg-green-500 rounded-md shadow-sm hover:bg-green-600 active:scale-95 transition-transform">
                    <i class="fa-solid fa-user-check mr-1"></i> お客様 到着確認
                </button>
            `;
        } else if (laneData.receptionStatus === "available") {
            if (laneData.status === "available") {
                receptionStatusDisplay = "案内可";
                receptionStatusClass = "text-green-600";
            }
        }

        if (laneData.receptionStatus === "available" && laneData.status === "occupied" && (laneData.selectedOptions?.length || laneData.receptionNotes)) {
            if (laneData.selectedOptions?.length) {
                optionsDisplay = `
                    <div class="mt-2 text-xs text-gray-700 font-medium bg-gray-100 p-2 rounded">
                        <i class="fa-solid fa-check-double mr-1 text-blue-600"></i>
                        プラン: ${laneData.selectedOptions.join(", ")}
                    </div>
                `;
            }
            if (laneData.receptionNotes) {
                notesDisplay = `
                    <div class="mt-2 text-xs text-gray-700 font-medium bg-yellow-50 p-2 rounded border border-yellow-200">
                        <i class="fa-solid fa-flag mr-1 text-yellow-500"></i>
                        備考: ${laneData.receptionNotes}
                    </div>
                `;
            }
        } else if (laneData.receptionStatus === "guiding" && (laneData.selectedOptions?.length || laneData.receptionNotes)) {
            if (laneData.selectedOptions?.length) {
                optionsDisplay = `
                    <div class="mt-2 text-xs text-blue-600 font-medium bg-blue-50 p-2 rounded">
                        <i class="fa-solid fa-check-double mr-1"></i>
                        プラン: ${laneData.selectedOptions.join(", ")}
                    </div>
                `;
            }
            if (laneData.receptionNotes) {
                notesDisplay = `
                    <div class="mt-2 text-xs text-yellow-600 font-medium bg-yellow-50 p-2 rounded border border-yellow-200">
                        <i class="fa-solid fa-flag mr-1 text-yellow-500"></i>
                        備考: ${laneData.receptionNotes}
                    </div>
                `;
            }
        }

        const statusButtons = config.laneStatuses.map((status) => {
            const isCurrent = laneData.status === status.id;
            return `
                <button data-action="set-lane-status" data-docid="${docId}" data-status="${status.id}" 
                        class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition ${
                            isCurrent
                            ? `text-white shadow ${status.colorClass}`
                            : "text-gray-700 bg-gray-100 hover:bg-gray-200"
                        }">
                    ${status.icon} ${status.name}
                </button>
            `;
        }).join("");

        const pauseReasonsOptionsHtml = (config.pauseReasons || []).map((reason) =>
            `<option value="${reason.id}" ${laneData.pauseReasonId === reason.id ? "selected" : ""}>${reason.name}</option>`
        ).join("");

        const pauseReasonSelect = `
            <div id="pause-reason-div-${docId}" class="${laneData.status === "paused" ? "mt-3" : "hidden"}">
                <label for="pause-reason-select-${docId}" class="block text-sm font-medium text-gray-700 mb-1">休止理由:</label>
                <select id="pause-reason-select-${docId}" data-action="set-pause-reason" data-docid="${docId}" 
                        class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="">--- 理由を選択 ---</option>
                    ${pauseReasonsOptionsHtml}
                </select>
            </div>
        `;

        laneElement.innerHTML = `
            <h4 class="font-semibold text-gray-800">${laneDisplayName}</h4>
            
            <div class="text-xs text-gray-400 text-center mt-1">
                ${staffNameDisplay}
            </div>
            
            <div class="text-center mt-2">
                <p class="text-sm ${receptionStatusClass}">${receptionStatusDisplay}</p>
            </div>

            ${optionsDisplay}

            ${notesDisplay}

            ${arrivalButton}
            
            <div class="mt-4 pt-4 border-t">
                <p class="text-sm font-medium text-gray-700 mb-2">レーンの状況を変更:</p>
                <div class="flex space-x-2">
                    ${statusButtons}
                </div>
                ${pauseReasonSelect}
            </div>
        `;
        roomGrid.appendChild(laneElement);
    });

    dom.staffLaneDashboard.appendChild(roomGrid);
}

/**
 * 管理設定タブを描画 (ローカルの編集用データを使用)
 * ★修正: モバイルでのレイアウト崩れ防止 (min-w-0, ラベル非表示)
 */
export function renderAdminSettings(context: AppContext): void {
    const { dom, state } = context;
    const config = state.localAdminConfig;

    // --- イベント基本設定 ---
    dom.adminEventNameInput.value = config.eventName || "";

    // --- 部屋リスト ---
    dom.adminRoomList.innerHTML = "";
    if (!config.rooms || config.rooms.length === 0) {
        dom.adminRoomList.innerHTML = '<p class="text-gray-400 text-sm">部屋がありません。</p>';
    }

    config.rooms.forEach((room, index) => {
        const isFirst = index === 0;
        const isLast = index === config.rooms.length - 1;

        const roomElement = document.createElement("div");
        roomElement.className = "flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition";

        roomElement.innerHTML = `
            <div class="flex flex-col space-y-1 mr-1 flex-shrink-0">
                <button data-action="move-room-up" data-index="${index}" 
                        class="w-6 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        ${isFirst ? "disabled" : ""}>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button data-action="move-room-down" data-index="${index}" 
                        class="w-6 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        ${isLast ? "disabled" : ""}>
                    <i class="fa-solid fa-chevron-down"></i>
                </button>
            </div>

            <input type="text" data-action="edit-room-name" data-id="${room.id}" value="${room.name}" 
                   class="flex-grow min-w-0 px-2 py-1 border border-gray-300 rounded-md sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                   placeholder="部屋名">
            
            <div class="flex items-center flex-shrink-0">
                <span class="text-xs text-gray-500 mr-1 hidden sm:inline">レーン数:</span>
                <input type="number" data-action="edit-room-lanes" data-id="${room.id}" value="${room.lanes}" min="1" 
                       class="w-12 sm:w-16 px-1 sm:px-2 py-1 border border-gray-300 rounded-md sm:text-sm text-center focus:ring-indigo-500 focus:border-indigo-500">
            </div>

            <button data-action="delete-room" data-id="${room.id}" 
                    class="ml-1 sm:ml-2 w-8 h-8 flex flex-shrink-0 items-center justify-center bg-white border border-red-200 text-red-500 rounded-full hover:bg-red-50 transition"
                    title="削除">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        dom.adminRoomList.appendChild(roomElement);
    });

    // --- オプションリスト ---
    dom.adminOptionsList.innerHTML = "";
    if (!config.options || config.options.length === 0) {
        dom.adminOptionsList.innerHTML = '<p class="text-gray-400 text-sm">オプションがありません。</p>';
    }
    config.options.forEach((option) => {
        const optionElement = document.createElement("div");
        optionElement.className = "flex items-center space-x-2 p-2 bg-gray-50 rounded";
        optionElement.innerHTML = `
            <input type="text" data-action="edit-option-name" data-id="${option.id}" value="${option.name}" class="flex-grow min-w-0 px-2 py-1 border border-gray-300 rounded-md sm:text-sm">
            <button data-action="delete-option" data-id="${option.id}" class="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs flex-shrink-0">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        dom.adminOptionsList.appendChild(optionElement);
    });

    // --- 休止理由リスト ---
    dom.adminPauseReasonsList.innerHTML = "";
    if (!config.pauseReasons || config.pauseReasons.length === 0) {
        dom.adminPauseReasonsList.innerHTML = '<p class="text-gray-400 text-sm">休止理由がありません。</p>';
    }
    config.pauseReasons.forEach((reason) => {
        const reasonElement = document.createElement("div");
        reasonElement.className = "flex items-center space-x-2 p-2 bg-gray-50 rounded";
        reasonElement.innerHTML = `
            <input type="text" data-action="edit-pause-reason-name" data-id="${reason.id}" value="${reason.name}" class="flex-grow min-w-0 px-2 py-1 border border-gray-300 rounded-md sm:text-sm">
            <button data-action="delete-pause-reason" data-id="${reason.id}" class="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs flex-shrink-0">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        dom.adminPauseReasonsList.appendChild(reasonElement);
    });
}

/**
 * 管理設定タブ (レーン名カスタム) を描画
 */
export function renderAdminLaneNames(context: AppContext): void {
    const { dom, state } = context;
    dom.adminLaneList.innerHTML = "";

    const allLanes = getAllLanes(context);

    if (allLanes.length === 0) {
        dom.adminLaneList.innerHTML = '<p class="text-gray-400 text-sm">レーンがありません。「管理設定」で部屋を保存してください。</p>';
        return;
    }

    [...state.dynamicAppConfig.rooms]
        .sort((left, right) => left.name.localeCompare(right.name))
        .forEach((room) => {
            const roomLanes = allLanes
                .filter((lane) => lane.data.roomId === room.id)
                .sort((left, right) => left.data.laneNum - right.data.laneNum);

            if (roomLanes.length === 0) {
                return;
            }

            const roomGroupElement = document.createElement("div");
            roomGroupElement.className = "mb-3";
            roomGroupElement.innerHTML = `<h4 class="font-medium text-gray-800 mb-2">${room.name}</h4>`;

            const lanesList = document.createElement("div");
            lanesList.className = "space-y-2 pl-2";

            roomLanes.forEach((lane) => {
                const laneElement = document.createElement("div");
                laneElement.className = "flex items-center space-x-2";
                laneElement.innerHTML = `
                    <label class="w-20 text-sm text-gray-600">レーン ${lane.data.laneNum}:</label>
                    <input type="text" data-action="edit-custom-name" data-docid="${lane.docId}" 
                            value="${lane.data.customName || ""}" 
                            class="flex-grow px-2 py-1 border border-gray-300 rounded-md sm:text-sm" 
                            placeholder="カスタム名 (例: 小学生レーン)">
                    <button data-action="save-custom-name" data-docid="${lane.docId}" 
                            class="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-xs font-medium">
                        保存
                    </button>
                `;
                lanesList.appendChild(laneElement);
            });

            roomGroupElement.appendChild(lanesList);
            dom.adminLaneList.appendChild(roomGroupElement);
        });
}
