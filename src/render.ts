import { canAccessTab, canManageRoom, getActorDisplayName, getAllowedRoomIds, getDefaultTab, getVisibleRooms, hasApprovedAccess, hasRole, ROLE_LABELS } from "./access.js";
import { STATUS_ICON_SVGS, UI_ICON_SVGS } from "./icons.js";
import { updateReceptionStatus } from "./writes.js";
import type { AccessMember, AccessRequest, AppConfig, AppContext, LaneData, RoleId, TabId } from "./types.js";

function getAllLanes(context: AppContext): Array<{ docId: string; data: LaneData }> {
    return Object.entries(context.state.currentLanesState).map(([docId, data]) => ({
        docId,
        data
    }));
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getRoleOptions(selectedRole: RoleId): string {
    return (["staff", "reception", "admin"] as RoleId[]).map((role) => {
        return `<option value="${role}" ${selectedRole === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`;
    }).join("");
}

function buildRoomAssignmentMarkup(context: AppContext, selectedRoomIds: string[], uid: string): string {
    const selected = new Set(selectedRoomIds);
    return context.state.dynamicAppConfig.rooms.map((room) => `
        <label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
            <input type="checkbox" data-room-assignment data-uid="${uid}" value="${room.id}" ${selected.has(room.id) ? "checked" : ""}>
            <span>${escapeHtml(room.name)}</span>
        </label>
    `).join("");
}

function getAuthorizationSourceBadge(member: AccessMember): string {
    if (member.authorizationSource === "roster") {
        return '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">名簿連携</span>';
    }
    return '<span class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">手動承認</span>';
}

function getRoomSummaryState(waiting: number, availableCount: number): {
    chipClass: string;
    icon: string;
    label: string;
    helper: string;
} {
    if (waiting > 0) {
        return {
            chipClass: "summary-chip summary-chip-alert",
            icon: UI_ICON_SVGS.queue,
            label: `待機 ${waiting}組`,
            helper: "受付対応が必要です"
        };
    }

    if (availableCount > 0) {
        return {
            chipClass: "summary-chip summary-chip-positive",
            icon: STATUS_ICON_SVGS.available,
            label: `空き ${availableCount}レーン`,
            helper: "すぐ案内できます"
        };
    }

    return {
        chipClass: "summary-chip summary-chip-neutral",
        icon: UI_ICON_SVGS.full,
        label: "満室",
        helper: "空き待ちなし"
    };
}

// --- UI描画 (Render) ---

export function scheduleRender(context: AppContext): void {
    if (context.state.renderScheduled) {
        return;
    }

    context.state.renderScheduled = true;
    requestAnimationFrame(() => {
        context.state.renderScheduled = false;
        renderAllUI(context);
    });
}

export function renderAllUI(context: AppContext): void {
    renderAuthShell(context);

    if (!hasApprovedAccess(context)) {
        return;
    }

    renderTabVisibility(context);
    renderReceptionList(context);
    renderStaffRoomSelect(context);

    const visibleRooms = getVisibleRooms(context);
    const nextRoomId = context.dom.staffRoomSelect.value || visibleRooms[0]?.id || "";
    context.dom.staffRoomSelect.value = nextRoomId;
    renderStaffLaneDashboard(context, nextRoomId);

    renderAdminSettings(context);
    renderAdminLaneNames(context);
    renderAccessManagement(context);
    renderRoomSummaryBar(context);
}

function renderAuthShell(context: AppContext): void {
    const { dom, state } = context;
    const member = state.accessMember;
    const request = state.selfAccessRequest;

    dom.authUserName.textContent = state.authUser?.displayName || "未ログイン";
    dom.authUserEmail.textContent = state.authUser?.email || "アクセス権が必要です";

    dom.authSignInBtn.classList.toggle("hidden", Boolean(state.authUser));
    dom.authSignOutBtn.classList.toggle("hidden", !state.authUser);

    if (member?.isActive) {
        dom.authStatusText.textContent = "承認済みメンバーとして利用できます。";
        dom.authRoleBadge.textContent = ROLE_LABELS[member.role];
        dom.authRoleBadge.className = "inline-flex items-center rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-100";
        dom.authLoginCard.classList.add("hidden");
        dom.authPendingCard.classList.add("hidden");
        dom.appShell.classList.remove("hidden");
    } else if (member && !member.isActive) {
        dom.authStatusText.textContent = "このアカウントは現在利用停止です。";
        dom.authRoleBadge.textContent = "利用停止";
        dom.authRoleBadge.className = "inline-flex items-center rounded-lg border border-rose-300/30 bg-rose-400/15 px-3 py-1 text-xs font-bold text-rose-100";
        dom.authPendingMessage.textContent = "今年度名簿に含まれていないか、管理者が利用停止にしています。必要なら管理者へ連絡してください。";
        dom.authLoginCard.classList.add("hidden");
        dom.authPendingCard.classList.remove("hidden");
        dom.appShell.classList.add("hidden");
    } else if (state.authUser) {
        const status = request?.status || "pending";
        const pendingMessage = status === "rejected"
            ? "このアカウントの利用は停止または却下されています。管理者へ連絡してください。"
            : "ログインは完了しました。名簿登録済みなら自動承認、名簿外アカウントは管理者承認後に利用できます。";

        dom.authStatusText.textContent = "承認待ちのため、操作はロックされています。";
        dom.authRoleBadge.textContent = status === "rejected" ? "利用停止" : "承認待ち";
        dom.authRoleBadge.className = `inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold border ${
            status === "rejected"
                ? "bg-rose-400/15 text-rose-100 border-rose-300/30"
                : "bg-amber-300/15 text-amber-100 border-amber-200/30"
        }`;
        dom.authPendingMessage.textContent = pendingMessage;
        dom.authLoginCard.classList.add("hidden");
        dom.authPendingCard.classList.remove("hidden");
        dom.appShell.classList.add("hidden");
    } else {
        dom.authStatusText.textContent = "Google アカウントでログインしてください。名簿登録済み Gmail は自動承認、名簿外アカウントは承認待ちになります。";
        dom.authRoleBadge.textContent = "";
        dom.authRoleBadge.className = "hidden";
        dom.authPendingMessage.textContent = "";
        dom.authLoginCard.classList.remove("hidden");
        dom.authPendingCard.classList.add("hidden");
        dom.appShell.classList.add("hidden");
    }
}

function renderTabVisibility(context: AppContext): void {
    const { dom, state } = context;
    const visibleTabs = dom.tabs.querySelectorAll<HTMLButtonElement>("button[data-tab]");

    visibleTabs.forEach((button) => {
        const tabId = button.dataset.tab as TabId | undefined;
        if (!tabId) {
            return;
        }

        const isVisible = canAccessTab(context, tabId);
        button.classList.toggle("hidden", !isVisible);
    });

    if (!canAccessTab(context, state.activeTab)) {
        state.activeTab = getDefaultTab(context);
    }

    visibleTabs.forEach((button) => {
        const tabId = button.dataset.tab as TabId | undefined;
        if (!tabId) {
            return;
        }

        if (state.activeTab === tabId) {
            button.classList.add("active");
        } else {
            button.classList.remove("active");
        }
    });

    dom.tabContents.querySelectorAll(".tab-pane").forEach((pane) => {
        pane.classList.toggle("hidden", pane.id !== `tab-${state.activeTab}`);
    });
}

function renderAccessManagement(context: AppContext): void {
    const { dom, state } = context;

    if (!hasRole(context, ["admin"])) {
        dom.adminAccessRequestList.innerHTML = '<p class="text-sm text-slate-400">管理者のみ閲覧できます。</p>';
        dom.adminMemberList.innerHTML = '<p class="text-sm text-slate-400">管理者のみ閲覧できます。</p>';
        return;
    }

    const pendingRequests = state.accessRequestsCache.filter((request) => request.status === "pending");
    if (pendingRequests.length === 0) {
        dom.adminAccessRequestList.innerHTML = '<p class="text-sm text-slate-400">承認待ちの申請はありません。</p>';
    } else {
        dom.adminAccessRequestList.innerHTML = pendingRequests.map((request) => `
            <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm" data-request-card data-uid="${request.uid}">
                <div class="mb-3">
                    <p class="text-sm font-bold text-slate-800">${escapeHtml(request.displayName || "名称未設定")}</p>
                    <p class="text-xs text-slate-500">${escapeHtml(request.email || request.uid)}</p>
                </div>
                <div class="grid gap-3">
                    <label class="text-xs font-bold text-slate-600">
                        付与ロール
                        <select class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-role-input data-uid="${request.uid}">
                            ${getRoleOptions("staff")}
                        </select>
                    </label>
                    <div>
                        <p class="mb-2 text-xs font-bold text-slate-600">担当部屋 (staff 用)</p>
                        <div class="flex flex-wrap gap-2">
                            ${buildRoomAssignmentMarkup(context, [], request.uid)}
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button data-action="approve-access-request" data-uid="${request.uid}" class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
                            承認
                        </button>
                        <button data-action="reject-access-request" data-uid="${request.uid}" class="rounded-md bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700">
                            却下
                        </button>
                    </div>
                </div>
            </div>
        `).join("");
    }

    if (state.accessMembersCache.length === 0) {
        dom.adminMemberList.innerHTML = '<p class="text-sm text-slate-400">登録済みメンバーがまだいません。</p>';
        return;
    }

    dom.adminMemberList.innerHTML = state.accessMembersCache.map((member) => `
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-member-card data-uid="${member.uid}">
            <div class="mb-3 flex items-start justify-between gap-3">
                <div>
                    <p class="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
                        ${escapeHtml(member.displayName || "名称未設定")}
                        ${state.userId === member.uid ? '<span class="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">あなた</span>' : ""}
                        ${getAuthorizationSourceBadge(member)}
                        ${member.grade ? `<span class="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">${escapeHtml(member.grade)}</span>` : ""}
                    </p>
                    <p class="text-xs text-slate-500">${escapeHtml(member.email || member.uid)}</p>
                </div>
                <label class="inline-flex items-center gap-2 text-xs font-bold text-slate-600">
                    <input type="checkbox" data-active-input data-uid="${member.uid}" ${member.isActive ? "checked" : ""}>
                    有効
                </label>
            </div>
            <div class="grid gap-3">
                <label class="text-xs font-bold text-slate-600">
                    ロール
                    <select class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-role-input data-uid="${member.uid}">
                        ${getRoleOptions(member.role)}
                    </select>
                </label>
                <div>
                    <p class="mb-2 text-xs font-bold text-slate-600">担当部屋 (staff 用)</p>
                    <div class="flex flex-wrap gap-2">
                        ${buildRoomAssignmentMarkup(context, member.assignedRoomIds, member.uid)}
                    </div>
                </div>
                <button data-action="save-access-member" data-uid="${member.uid}" class="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">
                    権限を保存
                </button>
            </div>
        </div>
    `).join("");
}

/**
 * ★新規追加: 全部屋の簡易状況を表示するサマリーバー
 * (待機がある部屋は赤、空きがある部屋は緑、満室はグレーで表示)
 */
function renderRoomSummaryBar(context: AppContext): void {
    const { dom, state } = context;
    const summaryBar = dom.roomSummaryBar;
    summaryBar.innerHTML = "";

    const visibleRooms = getVisibleRooms(context);
    if (visibleRooms.length === 0) {
        summaryBar.innerHTML = '<div class="app-surface px-5 py-4 text-sm text-slate-500">表示できる部屋がありません。管理者に担当部屋の割り当てを依頼してください。</div>';
        return;
    }

    const allLanes = Object.values(state.currentLanesState);

    visibleRooms.forEach((room) => {
        const roomState = state.currentRoomState[room.id] || { waitingGroups: 0 };
        const waiting = roomState.waitingGroups || 0;
        const roomLanes = allLanes.filter((lane) => lane.roomId === room.id);
        const availableCount = roomLanes.filter((lane) => lane.status === "available").length;
        const summaryState = getRoomSummaryState(waiting, availableCount);

        const chip = document.createElement("div");
        chip.className = summaryState.chipClass;
        chip.innerHTML = `
            <div>
                <p class="summary-chip-room">${escapeHtml(room.name)}</p>
                <p class="summary-chip-copy">${summaryState.helper}</p>
            </div>
            <span class="summary-chip-state">
                <span class="inline-flex">${summaryState.icon}</span>
                <span>${summaryState.label}</span>
            </span>
        `;

        chip.onclick = () => {
            if (!canAccessTab(context, "reception")) {
                return;
            }

            const receptionButton = document.querySelector('button[data-tab="reception"]') as HTMLButtonElement | null;
            if (receptionButton && !receptionButton.classList.contains("active")) {
                receptionButton.click();
            }

            setTimeout(() => {
                const cards = document.querySelectorAll(".room-dashboard-card h3");
                for (const heading of cards) {
                    if (heading.textContent === room.name) {
                        const card = heading.closest(".room-dashboard-card") as HTMLElement | null;
                        if (!card) {
                            break;
                        }
                        card.scrollIntoView({ behavior: "smooth", block: "center" });
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

    if (!canAccessTab(context, "reception")) {
        dom.receptionList.innerHTML = '<div class="app-surface col-span-full px-6 py-10 text-center text-slate-500">受付権限を持つメンバーのみ表示できます。</div>';
        return;
    }

    if (config.rooms.length === 0) {
        dom.receptionList.innerHTML = '<div class="app-surface col-span-full px-6 py-10 text-center text-slate-500">部屋設定がありません。「管理設定」で部屋を登録してください。</div>';
        return;
    }

    const allLanes = getAllLanes(context);
    const clickable = hasRole(context, ["admin", "reception"]);

    getVisibleRooms(context).forEach((room) => {
        const roomElement = document.createElement("div");
        roomElement.className = "room-dashboard-card";

        const currentState = state.currentRoomState[room.id] || { waitingGroups: 0 };
        const waitingGroups = currentState.waitingGroups || 0;
        const headerElement = document.createElement("div");
        headerElement.className = "room-dashboard-header";
        const waitBadgeClass = waitingGroups > 0 ? "wait-exists" : "wait-zero";

        headerElement.innerHTML = `
            <div>
                <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Room</p>
                <div class="mt-2 flex items-baseline gap-2">
                    <h3 class="text-[1.65rem] font-bold tracking-tight text-slate-900">${escapeHtml(room.name)}</h3>
                    <span class="text-xs font-medium text-slate-400">全 ${room.lanes} レーン</span>
                </div>
            </div>
            <div class="flex flex-col items-end">
                <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">待機</span>
                <div class="${waitBadgeClass} wait-badge-large">
                    ${waitingGroups > 0 ? `${waitingGroups}組` : "0組"}
                </div>
            </div>
        `;
        roomElement.appendChild(headerElement);

        const lanesContainer = document.createElement("div");
        lanesContainer.className = "room-dashboard-grid";
        const roomLanes = allLanes
            .filter((lane) => lane.data.roomId === room.id)
            .sort((left, right) => left.data.laneNum - right.data.laneNum);

        if (roomLanes.length === 0) {
            lanesContainer.innerHTML = '<p class="col-span-full py-8 text-center text-sm text-slate-400">レーン未設定</p>';
        }

        roomLanes.forEach((lane) => {
            const docId = lane.docId;
            const laneData = lane.data;
            const laneName = escapeHtml(laneData.customName || `レーン ${laneData.laneNum}`);

            let tileClass = "";
            let statusIcon = "";
            let statusText = "";
            let isClickable = false;
            let additionalInfo = "";

            if (laneData.receptionStatus === "guiding") {
                tileClass = "tile-guiding";
                statusIcon = STATUS_ICON_SVGS.guiding;
                statusText = "案内中";
            } else {
                switch (laneData.status) {
                    case "available":
                        tileClass = "tile-available";
                        statusIcon = STATUS_ICON_SVGS.available;
                        statusText = "空き";
                        isClickable = clickable;
                        break;
                    case "occupied":
                        tileClass = "tile-occupied";
                        statusIcon = STATUS_ICON_SVGS.occupied;
                        statusText = "使用中";
                        break;
                    case "preparing":
                        tileClass = "tile-preparing";
                        statusIcon = STATUS_ICON_SVGS.preparing;
                        statusText = "準備中";
                        break;
                    case "paused":
                        tileClass = "tile-paused";
                        statusIcon = STATUS_ICON_SVGS.paused;
                        statusText = "休止中";
                        if (laneData.pauseReasonId) {
                            const reason = config.pauseReasons.find((item) => item.id === laneData.pauseReasonId);
                            if (reason) {
                                additionalInfo = `<span class="lane-tile-note">${escapeHtml(reason.name)}</span>`;
                            }
                        }
                        break;
                    default:
                        tileClass = "tile-paused";
                        statusIcon = STATUS_ICON_SVGS.paused;
                        statusText = "不明";
                }
            }

            const laneTile = document.createElement("div");
            laneTile.className = `lane-tile ${tileClass}${isClickable ? " lane-tile-clickable" : ""}`;

            let innerContent = `
                <div class="lane-tile-number">${laneName}</div>
                <div class="lane-tile-status">
                    <span class="inline-flex">${statusIcon}</span>
                    <span>${statusText}</span>
                </div>
                ${additionalInfo}
            `;

            if (laneData.selectedOptions?.length) {
                innerContent += `
                    <div class="lane-tile-badge lane-tile-badge-options">
                        <span class="inline-flex">${UI_ICON_SVGS.options}</span>
                        <span>Op</span>
                    </div>
                `;
            }
            if (laneData.receptionNotes) {
                innerContent += `
                    <div class="lane-tile-badge lane-tile-badge-note">
                        <span class="inline-flex">${UI_ICON_SVGS.note}</span>
                        <span>Memo</span>
                    </div>
                `;
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
    if (!hasRole(context, ["admin", "reception"])) {
        alert("受付権限を持つメンバーのみ操作できます。");
        return;
    }

    const { dom, state } = context;
    const laneData = state.currentLanesState[laneDocId];
    if (!laneData) {
        alert("レーン情報が見つかりません。");
        return;
    }

    const config = state.dynamicAppConfig;

    const laneName = laneData.customName || `レーン ${laneData.laneNum}`;
    dom.receptionModalTitle.textContent = `${laneName}へ案内`;

    dom.receptionModalContent.innerHTML = `
        <div class="mb-5 rounded-2xl bg-slate-50/80 p-4">
            <h4 class="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-500">オプション選択</h4>
            <div id="reception-modal-options" class="max-h-40 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/80 p-3">
                ${config.options.length > 0 ?
                    config.options.map((option) => `
                        <label class="mb-2 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-sm text-slate-800 hover:bg-slate-50">
                            <input type="checkbox" class="reception-opt-chk accent-blue-600" value="${escapeHtml(option.name)}"
                                ${laneData.selectedOptions && laneData.selectedOptions.includes(option.name) ? "checked" : ""}>
                            <span class="truncate">${escapeHtml(option.name)}</span>
                        </label>
                    `).join("") :
                    '<p class="text-xs text-slate-400">オプションは設定されていません。</p>'
                }
            </div>
        </div>

        <div class="mb-6 rounded-2xl bg-amber-50/70 p-4">
            <label for="reception-modal-notes" class="mb-2 block text-sm font-bold text-amber-900">備考 (任意)</label>
            <input type="text" id="reception-modal-notes" 
                   class="w-full px-4 py-3 text-sm" 
                   placeholder="例: 人数、特徴など (任意)"
                   value="${escapeHtml(laneData.receptionNotes || "")}">
        </div>

        <button id="reception-modal-start-btn" 
                class="w-full rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20">
            <span class="mr-2 inline-flex">${STATUS_ICON_SVGS.guiding}</span>案内中にする
        </button>
    `;

    dom.receptionLaneModal.classList.remove("hidden");
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

        await updateReceptionStatus(context, laneDocId, "guiding", null, selectedOptions, receptionNotes);

        dom.receptionLaneModal.classList.add("hidden");
        startButton.disabled = false;
        startButton.innerHTML = `<span class="mr-2 inline-flex">${STATUS_ICON_SVGS.guiding}</span>案内中にする`;
    };
}

/**
 * レーン担当用ビュー (部屋選択) を描画
 */
export function renderStaffRoomSelect(context: AppContext): void {
    const { dom, state } = context;
    const visibleRooms = getVisibleRooms(context);
    const currentSelectedRoom = dom.staffRoomSelect.value;
    const actorName = getActorDisplayName(context) || "表示名未設定";

    dom.staffOperatorName.textContent = actorName;
    dom.staffOperatorMeta.textContent = state.accessMember?.email
        ? `${state.accessMember.email} で操作中`
        : "名簿または認証情報の表示名を利用します";

    dom.staffRoomSelect.innerHTML = '<option value="">--- 部屋を選択してください ---</option>';
    visibleRooms.forEach((room) => {
        const option = document.createElement("option");
        option.value = room.id;
        option.textContent = room.name;
        dom.staffRoomSelect.appendChild(option);
    });

    if (visibleRooms.some((room) => room.id === currentSelectedRoom)) {
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

    if (!canAccessTab(context, "staff")) {
        dom.staffLaneDashboard.innerHTML = '<div class="app-surface px-6 py-10 text-center text-slate-500">レーン担当権限を持つメンバーのみ表示できます。</div>';
        return;
    }

    if (!selectedRoomId) {
        dom.staffLaneDashboard.innerHTML = getVisibleRooms(context).length === 0
            ? '<div class="app-surface px-6 py-10 text-center text-slate-500">担当部屋が割り当てられていません。管理者に連絡してください。</div>'
            : '<div class="app-surface px-6 py-10 text-center text-slate-500">上部のセレクトから担当する部屋を選択してください。</div>';
        return;
    }

    if (!canManageRoom(context, selectedRoomId)) {
        dom.staffLaneDashboard.innerHTML = '<div class="app-surface px-6 py-10 text-center text-slate-500">この部屋は操作できません。割り当て設定を確認してください。</div>';
        return;
    }

    const selectedRoomName = config.rooms.find((room) => room.id === selectedRoomId)?.name || "未選択";
    const currentState = state.currentRoomState[selectedRoomId] || { waitingGroups: 0 };
    const currentWaitingGroups = currentState.waitingGroups || 0;

    const waitControlElement = document.createElement("div");
    waitControlElement.className = "wait-control-card mb-6";
    waitControlElement.innerHTML = `
        <div class="wait-control-shell">
            <div>
                <div class="wait-control-head">
                    <p class="pill-eyebrow">Queue Control</p>
                    <span class="wait-control-tag">${escapeHtml(selectedRoomName)}</span>
                </div>
                <h3 class="mt-3 text-[1.55rem] font-black tracking-tight text-slate-900">待機組数 管理</h3>
                <p class="mt-2 max-w-xl text-sm leading-6 text-slate-500">${escapeHtml(selectedRoomName)} の待機数を受付表示と同期します。案内前後のタイミングで更新してください。</p>
            </div>
            <div class="wait-control-actions">
                <button data-action="dec-wait" data-roomid="${selectedRoomId}"
                        class="wait-adjust-button wait-adjust-button-dec ${currentWaitingGroups === 0 ? "opacity-50 cursor-not-allowed" : ""}"
                        ${currentWaitingGroups === 0 ? "disabled" : ""}>
                    <span class="inline-flex">${UI_ICON_SVGS.minus}</span>
                </button>
                <div class="wait-counter-card">
                    <div class="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">現在</div>
                    <div class="mt-2 text-4xl font-black tracking-tight text-blue-700">${currentWaitingGroups}</div>
                </div>
                <button data-action="inc-wait" data-roomid="${selectedRoomId}"
                        class="wait-adjust-button wait-adjust-button-inc">
                    <span class="inline-flex">${UI_ICON_SVGS.plus}</span>
                </button>
            </div>
        </div>
    `;
    dom.staffLaneDashboard.appendChild(waitControlElement);

    const roomLanes = getAllLanes(context)
        .filter((lane) => lane.data.roomId === selectedRoomId)
        .sort((left, right) => left.data.laneNum - right.data.laneNum);

    if (roomLanes.length === 0) {
        dom.staffLaneDashboard.innerHTML += '<div class="app-surface px-6 py-10 text-center text-slate-500">この部屋にはレーンがありません。</div>';
        return;
    }

    const roomGrid = document.createElement("div");
    roomGrid.className = "grid grid-cols-1 md:grid-cols-2 gap-4";

    roomLanes.forEach((lane) => {
        const docId = lane.docId;
        const laneData = lane.data;

        const laneElement = document.createElement("div");
        laneElement.className = "lane-card";

        const laneDisplayName = escapeHtml(laneData.customName || `レーン ${laneData.laneNum}`);
        const staffNameDisplay = laneData.staffName ? `最終操作: ${escapeHtml(laneData.staffName)}` : "最終操作: まだありません";
        const laneStatusConfig = config.laneStatuses.find((status) => status.id === laneData.status) || { name: "不明", icon: "" };
        const receptionStatusConfig = config.receptionStatuses.find((status) => status.id === laneData.receptionStatus) || { name: "不明", icon: "" };

        let receptionStatusDisplay = receptionStatusConfig.name || "受付待機";
        let receptionStatusTone = "lane-meta-chip";
        let arrivalButton = "";
        let optionsDisplay = "";
        let notesDisplay = "";
        const laneStatusDisplay = escapeHtml(laneStatusConfig.name || "不明");

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
            receptionStatusTone = "lane-meta-chip lane-meta-chip-guiding";
            arrivalButton = `
                <button data-action="confirm-arrival" data-docid="${docId}"
                        class="w-full rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-teal-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20">
                    <span class="mr-2 inline-flex">${UI_ICON_SVGS.arrival}</span>お客様 到着確認
                </button>
            `;
        } else if (laneData.receptionStatus === "available" && laneData.status === "available") {
            receptionStatusDisplay = "案内可";
            receptionStatusTone = "lane-meta-chip lane-meta-chip-open";
        }

        if (laneData.receptionStatus === "available" && laneData.status === "occupied" && (laneData.selectedOptions?.length || laneData.receptionNotes)) {
            if (laneData.selectedOptions?.length) {
                optionsDisplay = `
                    <div class="info-strip info-strip-options">
                        <span class="inline-flex">${UI_ICON_SVGS.options}</span>
                        <span>プラン: ${laneData.selectedOptions.map((option) => escapeHtml(option)).join(", ")}</span>
                    </div>
                `;
            }
            if (laneData.receptionNotes) {
                notesDisplay = `
                    <div class="info-strip info-strip-notes">
                        <span class="inline-flex">${UI_ICON_SVGS.note}</span>
                        <span>備考: ${escapeHtml(laneData.receptionNotes)}</span>
                    </div>
                `;
            }
        } else if (laneData.receptionStatus === "guiding" && (laneData.selectedOptions?.length || laneData.receptionNotes)) {
            if (laneData.selectedOptions?.length) {
                optionsDisplay = `
                    <div class="info-strip info-strip-options">
                        <span class="inline-flex">${UI_ICON_SVGS.options}</span>
                        <span>プラン: ${laneData.selectedOptions.map((option) => escapeHtml(option)).join(", ")}</span>
                    </div>
                `;
            }
            if (laneData.receptionNotes) {
                notesDisplay = `
                    <div class="info-strip info-strip-notes">
                        <span class="inline-flex">${UI_ICON_SVGS.note}</span>
                        <span>備考: ${escapeHtml(laneData.receptionNotes)}</span>
                    </div>
                `;
            }
        }

        const statusButtons = config.laneStatuses.map((status) => {
            const isCurrent = laneData.status === status.id;
            return `
                <button data-action="set-lane-status" data-docid="${docId}" data-status="${status.id}" 
                        class="status-action-button ${
                            isCurrent
                            ? `status-action-active ${status.colorClass}`
                            : "status-action-idle"
                        }">
                    <span class="inline-flex">${status.icon}</span>${status.name}
                </button>
            `;
        }).join("");

        const pauseReasonsOptionsHtml = (config.pauseReasons || []).map((reason) =>
            `<option value="${reason.id}" ${laneData.pauseReasonId === reason.id ? "selected" : ""}>${escapeHtml(reason.name)}</option>`
        ).join("");

        const pauseReasonSelect = `
            <div id="pause-reason-div-${docId}" class="${laneData.status === "paused" ? "rounded-xl border border-slate-200/80 bg-slate-50/80 p-4" : "hidden"}">
                <label for="pause-reason-select-${docId}" class="mb-2 block text-sm font-bold text-slate-700">休止理由</label>
                <select id="pause-reason-select-${docId}" data-action="set-pause-reason" data-docid="${docId}" 
                        class="block w-full px-4 py-3 text-sm">
                    <option value="">--- 理由を選択 ---</option>
                    ${pauseReasonsOptionsHtml}
                </select>
            </div>
        `;

        laneElement.innerHTML = `
            <div class="lane-card-header">
                <div>
                    <h4 class="lane-card-title">${laneDisplayName}</h4>
                    <p class="lane-card-subtext">${staffNameDisplay}</p>
                </div>
            </div>

            <div class="lane-card-meta">
                <span class="lane-meta-chip lane-meta-chip-primary">
                    <span class="inline-flex">${laneStatusConfig.icon || STATUS_ICON_SVGS.paused}</span>
                    <span>${laneStatusDisplay}</span>
                </span>
                <span class="${receptionStatusTone}">
                    <span class="inline-flex">${receptionStatusConfig.icon || STATUS_ICON_SVGS.guiding}</span>
                    <span>${escapeHtml(receptionStatusDisplay || "状態未設定")}</span>
                </span>
            </div>

            ${optionsDisplay}

            ${notesDisplay}

            ${arrivalButton}
            
            <div class="mt-2 border-t border-slate-200/80 pt-4">
                <p class="mb-3 text-sm font-bold text-slate-700">レーンの状況を変更</p>
                <div class="status-action-grid">
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

    dom.adminEventNameInput.value = config.eventName || "";

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

    if (!hasRole(context, ["admin"])) {
        dom.adminLaneList.innerHTML = '<p class="text-gray-400 text-sm">管理者のみ表示できます。</p>';
        return;
    }

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
