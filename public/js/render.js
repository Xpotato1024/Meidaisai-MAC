import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { canAccessTab, canManageRoom, getDefaultTab, getVisibleRooms, hasApprovedAccess, hasRole, ROLE_LABELS } from "./access.js";
import { renderReceptionLayoutEditor } from "./admin-layout-editor.js";
import { STATUS_ICON_SVGS, UI_ICON_SVGS } from "./icons.js";
import { getReceptionDisplayCardHeightPx, getReceptionRoomLayout, normalizeReceptionLayoutConfig, packReceptionRoomLayout, RECEPTION_LAYOUT_DISPLAY_GAP_PX } from "./reception-layout.js";
import { getEffectiveLaneState, normalizeRoomStateData } from "./room-state.js";
import { showToast } from "./toast.js";
import { updateReceptionStatus } from "./writes.js";
const TAB_LABELS = {
    reception: "受付",
    staff: "レーン担当",
    admin: "管理設定",
    members: "メンバー管理",
    database: "DB管理"
};
function getAllLanes(context) {
    return Object.entries(context.state.currentLanesState).map(([docId, data]) => ({
        docId,
        data
    }));
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
function getRoleOptions(context, selectedRole) {
    const availableRoles = ["staff", "reception", "admin"];
    if (selectedRole === "root") {
        availableRoles.push("root");
    }
    return availableRoles.map((role) => {
        return `<option value="${role}" ${selectedRole === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`;
    }).join("");
}
function getAuthorizationSourceBadge(member) {
    if (member.role === "root" || member.authorizationSource === "global") {
        return '<span class="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Root</span>';
    }
    if (member.authorizationSource === "roster") {
        return '<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">名簿連携</span>';
    }
    return '<span class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">手動承認</span>';
}
function getRoleRank(role) {
    if (role === "root") {
        return 0;
    }
    if (role === "admin") {
        return 1;
    }
    if (role === "reception") {
        return 2;
    }
    return 3;
}
function getGradeSortKey(grade) {
    const value = String(grade || "").trim();
    if (!value) {
        return Number.MAX_SAFE_INTEGER;
    }
    const normalized = value
        .replaceAll("年", "")
        .replaceAll("回", "")
        .replaceAll("生", "")
        .trim();
    const numericValue = Number.parseInt(normalized, 10);
    if (!Number.isNaN(numericValue)) {
        return numericValue;
    }
    const kanjiMap = {
        "一": 1,
        "二": 2,
        "三": 3,
        "四": 4,
        "五": 5,
        "六": 6
    };
    return kanjiMap[normalized] || Number.MAX_SAFE_INTEGER;
}
function getMemberSortLabel(sortMode) {
    if (sortMode === "grade-desc") {
        return "学年降順";
    }
    if (sortMode === "role") {
        return "権限順";
    }
    if (sortMode === "name") {
        return "名前順";
    }
    return "学年昇順";
}
function getRoomSummaryState(waiting, availableCount) {
    if (waiting > 0) {
        return {
            chipClass: "summary-chip summary-chip-alert",
            icon: UI_ICON_SVGS.queue,
            label: "待機あり"
        };
    }
    if (availableCount > 0) {
        return {
            chipClass: "summary-chip summary-chip-positive",
            icon: STATUS_ICON_SVGS.available,
            label: "案内可"
        };
    }
    return {
        chipClass: "summary-chip summary-chip-neutral",
        icon: UI_ICON_SVGS.full,
        label: "満室"
    };
}
function getReceptionRoomLaneVisuals(lanes, totalLanes) {
    const visualsByLane = new Map();
    lanes.forEach((lane) => {
        const laneNumber = Number(lane.data.laneNum || 0);
        if (!laneNumber || laneNumber > totalLanes) {
            return;
        }
        const effectiveState = getEffectiveLaneState(lane.data);
        const stateVisual = effectiveState === "available"
            ? { tileClass: "tile-available", icon: STATUS_ICON_SVGS.available, label: "空き" }
            : effectiveState === "guiding"
                ? { tileClass: "tile-guiding", icon: STATUS_ICON_SVGS.guiding, label: "案内中" }
                : effectiveState === "occupied"
                    ? { tileClass: "tile-occupied", icon: STATUS_ICON_SVGS.occupied, label: "使用中" }
                    : effectiveState === "preparing"
                        ? { tileClass: "tile-preparing", icon: STATUS_ICON_SVGS.preparing, label: "準備中" }
                        : { tileClass: "tile-paused", icon: STATUS_ICON_SVGS.paused, label: "休止中" };
        visualsByLane.set(laneNumber, {
            laneNumber,
            ...stateVisual
        });
    });
    const visuals = [];
    for (let laneNumber = 1; laneNumber <= totalLanes; laneNumber += 1) {
        visuals.push(visualsByLane.get(laneNumber) || {
            laneNumber,
            tileClass: "tile-paused",
            icon: STATUS_ICON_SVGS.paused,
            label: "休止中"
        });
    }
    return visuals;
}
function buildReceptionMetricMarkup(label, count, variantClass, icon) {
    const emphasisClass = count > 0 ? "is-active" : "is-zero";
    return `
        <span class="room-dashboard-metric ${variantClass} ${emphasisClass}" title="${label} ${count}" aria-label="${label} ${count}">
            <span class="inline-flex">${icon}</span>
            <span class="room-dashboard-metric-count">${count}</span>
        </span>
    `;
}
function getPendingWaitingGroupDelta(context, roomId) {
    const localTarget = context.state.waitingGroupLocalTargets[roomId];
    if (typeof localTarget === "number") {
        const normalizedLocalTarget = Math.max(0, localTarget);
        const currentWaitingGroups = Number(context.state.currentRoomState[roomId]?.waitingGroups || 0);
        return normalizedLocalTarget - currentWaitingGroups;
    }
    return 0;
}
function getRoomStateSnapshot(context, roomId, totalLanes) {
    const roomState = normalizeRoomStateData(context.state.currentRoomState[roomId], totalLanes);
    return {
        ...roomState,
        waitingGroups: Math.max(0, Number(roomState.waitingGroups || 0) + getPendingWaitingGroupDelta(context, roomId))
    };
}
function setChevronToggleState(button, expanded) {
    button.setAttribute("aria-expanded", String(expanded));
    button.innerHTML = expanded ? UI_ICON_SVGS.triangleUp : UI_ICON_SVGS.triangleDown;
}
function setMenuToggleState(button, expanded) {
    button.setAttribute("aria-expanded", String(expanded));
    button.innerHTML = expanded ? UI_ICON_SVGS.close : UI_ICON_SVGS.menu;
}
// --- UI描画 (Render) ---
export function scheduleRender(context) {
    if (context.state.renderScheduled) {
        return;
    }
    context.state.renderScheduled = true;
    requestAnimationFrame(() => {
        context.state.renderScheduled = false;
        renderAllUI(context);
    });
}
export function renderAllUI(context) {
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
function renderAuthShell(context) {
    const { dom, state } = context;
    const member = state.accessMember;
    const request = state.selfAccessRequest;
    const needsManualRequestName = Boolean(state.authUser && !member && (!request || request.status !== "rejected"));
    dom.authUserName.textContent = state.accessMember?.displayName
        || state.selfAccessRequest?.displayName
        || state.authUser?.email?.split("@")[0]
        || "未ログイン";
    dom.authUserEmail.textContent = state.authUser?.email || "アクセス権が必要です";
    dom.authStatusText.classList.remove("hidden");
    dom.authManualRequestForm.classList.add("hidden");
    dom.authSignInBtn.classList.toggle("hidden", Boolean(state.authUser));
    dom.authSignOutBtn.classList.toggle("hidden", !state.authUser);
    dom.globalEventDisplay.classList.toggle("is-collapsed", state.isStatusBannerCollapsed);
    dom.authAccountCard.classList.toggle("is-collapsed", state.isStatusBannerCollapsed);
    setChevronToggleState(dom.statusBannerToggleBtn, !state.isStatusBannerCollapsed);
    if (member?.isActive) {
        dom.authStatusText.textContent = "";
        dom.authStatusText.classList.add("hidden");
        dom.authRoleBadge.textContent = ROLE_LABELS[member.role];
        dom.authRoleBadge.className = "inline-flex items-center rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-100";
        dom.authLoginCard.classList.add("hidden");
        dom.authPendingCard.classList.add("hidden");
        dom.appShell.classList.remove("hidden");
        dom.headerTabsShell.classList.remove("hidden");
    }
    else if (member && !member.isActive) {
        dom.authStatusText.textContent = "このアカウントは現在利用停止です。";
        dom.authRoleBadge.textContent = "利用停止";
        dom.authRoleBadge.className = "inline-flex items-center rounded-lg border border-rose-300/30 bg-rose-400/15 px-3 py-1 text-xs font-bold text-rose-100";
        dom.authPendingMessage.textContent = "今年度名簿に含まれていないか、管理者が利用停止にしています。必要なら管理者へ連絡してください。";
        dom.authLoginCard.classList.add("hidden");
        dom.authPendingCard.classList.remove("hidden");
        dom.appShell.classList.add("hidden");
        dom.headerTabsShell.classList.add("hidden");
    }
    else if (state.authUser) {
        const status = request?.status || "pending";
        const pendingMessage = status === "rejected"
            ? "このアカウントの利用は停止または却下されています。管理者へ連絡してください。"
            : "ログインは完了しました。名簿外アカウントは、下の表示名を入力して承認リクエストを送信してください。";
        dom.authStatusText.textContent = "承認待ちのため、操作はロックされています。";
        dom.authRoleBadge.textContent = status === "rejected" ? "利用停止" : "承認待ち";
        dom.authRoleBadge.className = `inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold border ${status === "rejected"
            ? "bg-rose-400/15 text-rose-100 border-rose-300/30"
            : "bg-amber-300/15 text-amber-100 border-amber-200/30"}`;
        dom.authPendingMessage.textContent = pendingMessage;
        if (status !== "rejected" && needsManualRequestName) {
            dom.authManualRequestForm.classList.remove("hidden");
            if (!dom.authManualDisplayNameInput.value.trim()) {
                dom.authManualDisplayNameInput.value = String(request?.displayName || "").trim();
            }
            dom.authManualRequestSubmitBtn.textContent = status === "approved"
                ? "承認リクエストを再送信"
                : request
                    ? "表示名を更新する"
                    : "承認リクエストを送信";
        }
        dom.authLoginCard.classList.add("hidden");
        dom.authPendingCard.classList.remove("hidden");
        dom.appShell.classList.add("hidden");
        dom.headerTabsShell.classList.add("hidden");
    }
    else {
        dom.authStatusText.textContent = "Google アカウントでログインすると権限を確認します。";
        dom.authRoleBadge.textContent = "";
        dom.authRoleBadge.className = "hidden";
        dom.authPendingMessage.textContent = "";
        dom.authLoginCard.classList.remove("hidden");
        dom.authPendingCard.classList.add("hidden");
        dom.appShell.classList.add("hidden");
        dom.headerTabsShell.classList.add("hidden");
    }
}
function renderTabVisibility(context) {
    const { dom, state } = context;
    const visibleTabs = dom.tabs.querySelectorAll("button[data-tab]");
    visibleTabs.forEach((button) => {
        const tabId = button.dataset.tab;
        if (!tabId) {
            return;
        }
        const isVisible = canAccessTab(context, tabId);
        button.classList.toggle("hidden", !isVisible);
    });
    if (!canAccessTab(context, state.activeTab)) {
        state.activeTab = getDefaultTab(context);
    }
    dom.tabsMenuLabel.textContent = TAB_LABELS[state.activeTab];
    dom.tabs.classList.toggle("hidden", !state.isNavMenuOpen);
    setMenuToggleState(dom.tabsMenuToggle, state.isNavMenuOpen);
    visibleTabs.forEach((button) => {
        const tabId = button.dataset.tab;
        if (!tabId) {
            return;
        }
        if (state.activeTab === tabId) {
            button.classList.add("active");
        }
        else {
            button.classList.remove("active");
        }
    });
    dom.tabContents.querySelectorAll(".tab-pane").forEach((pane) => {
        pane.classList.toggle("hidden", pane.id !== `tab-${state.activeTab}`);
    });
}
function renderAccessManagement(context) {
    const { dom, state } = context;
    if (!hasRole(context, ["root", "admin"])) {
        dom.adminAccessRequestList.innerHTML = '<p class="text-sm text-slate-400">管理者のみ閲覧できます。</p>';
        dom.adminMemberList.innerHTML = '<p class="text-sm text-slate-400">管理者のみ閲覧できます。</p>';
        return;
    }
    const pendingRequests = state.accessRequestsCache.filter((request) => request.status === "pending");
    if (pendingRequests.length === 0) {
        dom.adminAccessRequestList.innerHTML = '<p class="text-sm text-slate-400">承認待ちの申請はありません。</p>';
    }
    else {
        dom.adminAccessRequestList.innerHTML = pendingRequests.map((request) => `
            <div class="member-request-card" data-request-card data-uid="${request.uid}">
                <div class="mb-3">
                    <p class="member-card-name">${escapeHtml(request.displayName || "名称未設定")}</p>
                    <p class="member-card-email">${escapeHtml(request.email || request.uid)}</p>
                </div>
                <div class="grid gap-3">
                    <label class="member-card-label">
                        付与ロール
                        <select class="member-card-select mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-role-input data-uid="${request.uid}">
                            ${getRoleOptions(context, "staff")}
                        </select>
                    </label>
                    <div class="flex flex-wrap gap-2">
                        <button data-action="approve-access-request" data-uid="${request.uid}" class="ui-button ui-button-success member-card-action">
                            承認する
                        </button>
                        <button data-action="reject-access-request" data-uid="${request.uid}" class="ui-button member-card-action member-card-action-danger">
                            却下する
                        </button>
                    </div>
                </div>
            </div>
        `).join("");
    }
    const mergedMembersMap = new Map(state.accessMembersCache.map((member) => [member.uid, member]));
    if (state.globalAccessMember?.isActive) {
        const globalMember = state.globalAccessMember;
        const existing = mergedMembersMap.get(globalMember.uid);
        mergedMembersMap.set(globalMember.uid, {
            ...(existing || {}),
            ...globalMember,
            role: "root",
            authorizationSource: "global",
            isActive: true
        });
    }
    const mergedMembers = Array.from(mergedMembersMap.values());
    const selectedMemberSet = new Set(state.memberBulkSelectedUids);
    const sortedMembers = [...mergedMembers].sort((left, right) => {
        if (state.memberSortMode === "name") {
            return left.displayName.localeCompare(right.displayName, "ja");
        }
        if (state.memberSortMode === "role") {
            const roleGap = getRoleRank(left.role) - getRoleRank(right.role);
            if (roleGap !== 0) {
                return roleGap;
            }
            return left.displayName.localeCompare(right.displayName, "ja");
        }
        const direction = state.memberSortMode === "grade-desc" ? -1 : 1;
        const gradeGap = getGradeSortKey(left.grade) - getGradeSortKey(right.grade);
        if (gradeGap !== 0) {
            return gradeGap * direction;
        }
        const roleGap = getRoleRank(left.role) - getRoleRank(right.role);
        if (roleGap !== 0) {
            return roleGap;
        }
        return left.displayName.localeCompare(right.displayName, "ja");
    });
    const gradeOptions = Array.from(new Set(mergedMembers
        .map((member) => String(member.grade || "").trim())
        .filter(Boolean))).sort((left, right) => getGradeSortKey(left) - getGradeSortKey(right));
    const controlsMarkup = `
        <div class="member-console-tools mb-4 grid gap-4 rounded-[1rem] border border-slate-200/80 bg-slate-50/80 p-4">
            <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
                <label class="member-card-label">
                    並び順
                    <select class="member-card-select mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-action="member-sort-mode">
                        <option value="grade-asc" ${state.memberSortMode === "grade-asc" ? "selected" : ""}>学年昇順</option>
                        <option value="grade-desc" ${state.memberSortMode === "grade-desc" ? "selected" : ""}>学年降順</option>
                        <option value="role" ${state.memberSortMode === "role" ? "selected" : ""}>権限順</option>
                        <option value="name" ${state.memberSortMode === "name" ? "selected" : ""}>名前順</option>
                    </select>
                </label>
                <div class="member-card-label flex items-end text-slate-500">現在: ${getMemberSortLabel(state.memberSortMode)}</div>
            </div>
            <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_12rem_10rem_auto_auto]">
                <label class="member-card-label">
                    一括対象の学年
                    <select class="member-card-select mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-action="member-bulk-grade">
                        <option value="__all__" ${state.memberBulkGrade === "__all__" ? "selected" : ""}>全学年</option>
                        ${gradeOptions.map((grade) => `<option value="${escapeHtml(grade)}" ${state.memberBulkGrade === grade ? "selected" : ""}>${escapeHtml(grade)}</option>`).join("")}
                    </select>
                </label>
                <label class="member-card-label">
                    一括付与ロール
                    <select class="member-card-select mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-action="member-bulk-role">
                        ${getRoleOptions(context, state.memberBulkRole)}
                    </select>
                </label>
                <label class="member-card-label flex items-end gap-2">
                    <input type="checkbox" data-action="member-bulk-active" ${state.memberBulkIsActive ? "checked" : ""}>
                    有効にする
                </label>
                <button data-action="apply-member-bulk" class="ui-button ui-button-primary member-card-action xl:self-end">
                    学年で一括反映
                </button>
                <button data-action="apply-member-bulk-selected" class="ui-button ui-button-secondary member-card-action xl:self-end">
                    選択メンバーに反映
                </button>
            </div>
        </div>
    `;
    if (sortedMembers.length === 0) {
        dom.adminMemberList.innerHTML = `${controlsMarkup}<p class="text-sm text-slate-400">登録済みメンバーがまだいません。</p>`;
        return;
    }
    dom.adminMemberList.innerHTML = controlsMarkup + sortedMembers.map((member) => {
        const isSelf = state.userId === member.uid;
        const isRootMember = member.role === "root";
        const isLocked = isSelf || isRootMember;
        const helperText = isRootMember
            ? "Root アカウントは変更できません。"
            : isSelf
                ? "自分自身のロール変更や無効化はできません。"
                : "";
        return `
        <div class="member-access-card" data-member-card data-uid="${member.uid}">
            <div class="mb-3 flex items-start justify-between gap-3">
                <div>
                    <p class="member-card-name flex flex-wrap items-center gap-2">
                        <label class="member-select-check ${isRootMember ? "is-disabled" : ""}">
                            <input type="checkbox" data-select-member data-uid="${member.uid}" ${selectedMemberSet.has(member.uid) ? "checked" : ""} ${isRootMember ? "disabled" : ""}>
                        </label>
                        ${escapeHtml(member.displayName || "名称未設定")}
                        ${isSelf ? '<span class="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">あなた</span>' : ""}
                        ${getAuthorizationSourceBadge(member)}
                        ${member.grade ? `<span class="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">${escapeHtml(member.grade)}</span>` : ""}
                    </p>
                    <p class="member-card-email">${escapeHtml(member.email || member.uid)}</p>
                </div>
                <label class="member-card-label inline-flex items-center gap-2">
                    <input type="checkbox" data-active-input data-uid="${member.uid}" ${member.isActive ? "checked" : ""} ${isLocked ? "disabled" : ""}>
                    有効
                </label>
            </div>
            <div class="grid gap-3">
                <label class="member-card-label">
                    ロール
                    ${isRootMember
            ? `<div class="member-card-static-role mt-1">${ROLE_LABELS.root}</div>`
            : `<select class="member-card-select mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" data-role-input data-uid="${member.uid}" ${isLocked ? "disabled" : ""}>
                            ${getRoleOptions(context, member.role)}
                        </select>`}
                </label>
                ${helperText ? `<p class="text-xs font-bold text-slate-500">${escapeHtml(helperText)}</p>` : ""}
                <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <button data-action="save-access-member" data-uid="${member.uid}" class="ui-button ui-button-primary ui-button-block member-card-action" ${isLocked ? "disabled" : ""}>
                        権限を保存
                    </button>
                    <button data-action="delete-access-member" data-uid="${member.uid}" class="ui-button member-card-action member-card-action-danger" ${isLocked ? "disabled" : ""}>
                        削除
                    </button>
                </div>
            </div>
        </div>
    `;
    }).join("");
}
/**
 * ★新規追加: 全部屋の簡易状況を表示するサマリーバー
 * (待機がある部屋は赤、空きがある部屋は緑、満室はグレーで表示)
 */
function renderRoomSummaryBar(context) {
    const { dom } = context;
    const summaryBar = dom.roomSummaryBar;
    summaryBar.innerHTML = "";
    dom.summarySection.classList.toggle("is-collapsed", context.state.isSummaryCollapsed);
    summaryBar.classList.toggle("summary-strip-compact", context.state.isSummaryCollapsed);
    setChevronToggleState(dom.summaryToggleBtn, !context.state.isSummaryCollapsed);
    const visibleRooms = getVisibleRooms(context);
    if (visibleRooms.length === 0) {
        summaryBar.innerHTML = '<div class="app-surface px-5 py-4 text-sm text-slate-500">表示できる部屋がありません。管理設定で部屋を登録してください。</div>';
        return;
    }
    visibleRooms.forEach((room) => {
        const roomState = getRoomStateSnapshot(context, room.id, room.lanes);
        const waiting = Number(roomState.waitingGroups || 0);
        const availableCount = Number(roomState.availableLanes || 0);
        const summaryState = getRoomSummaryState(waiting, availableCount);
        const chip = document.createElement("div");
        if (context.state.isSummaryCollapsed) {
            const compactTone = waiting > 0
                ? "summary-chip-mini-alert"
                : availableCount > 0
                    ? "summary-chip-mini-positive"
                    : "summary-chip-mini-neutral";
            chip.className = `summary-chip-mini ${compactTone}`;
            chip.innerHTML = `
                <span class="summary-chip-mini-icon inline-flex">${summaryState.icon}</span>
                <span class="summary-chip-mini-room">${escapeHtml(room.name)}</span>
                <span class="summary-chip-mini-state">${summaryState.label}</span>
            `;
        }
        else {
            chip.className = summaryState.chipClass;
            chip.innerHTML = `
                <div class="summary-chip-main">
                    <p class="summary-chip-room">${escapeHtml(room.name)}</p>
                    <div class="summary-chip-metrics">
                        <span class="summary-chip-metric">空き ${availableCount}</span>
                        <span class="summary-chip-metric">待機 ${waiting}</span>
                        <span class="summary-chip-metric">全 ${room.lanes}</span>
                    </div>
                </div>
                <span class="summary-chip-state">
                    <span class="inline-flex">${summaryState.icon}</span>
                    <span>${summaryState.label}</span>
                </span>
            `;
        }
        chip.onclick = () => {
            if (!canAccessTab(context, "reception")) {
                return;
            }
            const receptionButton = document.querySelector('button[data-tab="reception"]');
            if (receptionButton && !receptionButton.classList.contains("active")) {
                receptionButton.click();
            }
            setTimeout(() => {
                const cards = document.querySelectorAll(".room-dashboard-card h3");
                for (const heading of cards) {
                    if (heading.textContent === room.name) {
                        const card = heading.closest(".room-dashboard-card");
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
export function updateGlobalHeader(context, config) {
    const { currentAppId, dom } = context;
    dom.globalEventNameText.textContent = config.eventName || "名称未設定";
    dom.globalAppIdText.textContent = `ID: ${currentAppId}`;
    dom.globalEventDisplay.classList.remove("hidden");
    document.title = `${config.eventName} - LINEΩ`;
}
/**
 * 受付用ビュー (ダッシュボードUI - 濃い色・詳細表示版)
 */
function renderReceptionList(context) {
    const { dom, state } = context;
    const config = state.dynamicAppConfig;
    dom.receptionList.innerHTML = "";
    dom.receptionList.className = "dashboard-grid";
    dom.receptionList.style.removeProperty("--packed-canvas-height");
    if (!canAccessTab(context, "reception")) {
        dom.receptionList.innerHTML = '<div class="app-surface col-span-full px-6 py-10 text-center text-slate-500">受付権限を持つメンバーのみ表示できます。</div>';
        return;
    }
    if (config.rooms.length === 0) {
        dom.receptionList.innerHTML = '<div class="app-surface col-span-full px-6 py-10 text-center text-slate-500">部屋設定がありません。「管理設定」で部屋を登録してください。</div>';
        return;
    }
    dom.receptionList.className = "dashboard-grid dashboard-grid-reception-layout";
    const visibleRooms = getVisibleRooms(context);
    const roomById = new Map(visibleRooms.map((room) => [room.id, room]));
    const packedLayout = packReceptionRoomLayout(visibleRooms, normalizeReceptionLayoutConfig(config.receptionLayout, config.rooms), RECEPTION_LAYOUT_DISPLAY_GAP_PX, getReceptionDisplayCardHeightPx);
    dom.receptionList.style.setProperty("--packed-canvas-height", `${packedLayout.canvasHeightPx}px`);
    packedLayout.placements.forEach((placement) => {
        const room = roomById.get(placement.roomId);
        if (!room) {
            return;
        }
        const roomElement = document.createElement("div");
        const roomLayout = getReceptionRoomLayout(config.receptionLayout, config.rooms, room.id);
        roomElement.className = "room-dashboard-card";
        roomElement.style.setProperty("--room-card-span", String(placement.widthUnits));
        roomElement.style.setProperty("--room-card-x", String(placement.xUnits));
        roomElement.style.setProperty("--room-card-y", `${placement.yPx}px`);
        roomElement.style.setProperty("--room-card-height", `${placement.heightPx}px`);
        roomElement.style.setProperty("--lane-grid-columns-mobile", String(Math.min(roomLayout.tileColumns, 2)));
        roomElement.style.setProperty("--lane-grid-columns-desktop", String(roomLayout.tileColumns));
        const roomState = getRoomStateSnapshot(context, room.id, room.lanes);
        const waitingGroups = Number(roomState.waitingGroups || 0);
        const availableLanes = Number(roomState.availableLanes || 0);
        const occupiedLanes = Number(roomState.occupiedLanes || 0);
        const preparingLanes = Number(roomState.preparingLanes || 0);
        const pausedLanes = Number(roomState.pausedLanes || 0);
        const guidingLanes = Number(roomState.guidingLanes || 0);
        const roomLanes = getAllLanes(context)
            .filter((lane) => lane.data.roomId === room.id)
            .sort((left, right) => left.data.laneNum - right.data.laneNum);
        const laneVisuals = getReceptionRoomLaneVisuals(roomLanes, room.lanes);
        const waitBadgeClass = waitingGroups > 0 ? "wait-exists" : "wait-zero";
        roomElement.innerHTML = `
            <div class="room-dashboard-header">
                <div class="room-dashboard-metrics room-dashboard-metrics-header">
                    ${buildReceptionMetricMarkup("空き", availableLanes, "room-dashboard-metric-available", STATUS_ICON_SVGS.available)}
                    ${buildReceptionMetricMarkup("案内中", guidingLanes, "room-dashboard-metric-guiding", STATUS_ICON_SVGS.guiding)}
                    ${buildReceptionMetricMarkup("使用中", occupiedLanes, "room-dashboard-metric-occupied", STATUS_ICON_SVGS.occupied)}
                    ${buildReceptionMetricMarkup("準備中", preparingLanes, "room-dashboard-metric-preparing", STATUS_ICON_SVGS.preparing)}
                    ${buildReceptionMetricMarkup("休止中", pausedLanes, "room-dashboard-metric-paused", STATUS_ICON_SVGS.paused)}
                </div>
                <div class="room-dashboard-header-main">
                    <div class="room-dashboard-title-block">
                        <h3 class="text-[1.65rem] font-bold tracking-tight text-slate-900">${escapeHtml(room.name)}</h3>
                        <div class="room-dashboard-submeta">
                            <span class="text-xs font-medium text-slate-400">全 ${room.lanes} レーン</span>
                        </div>
                    </div>
                    <div class="${waitBadgeClass} wait-badge-large">
                        <span class="wait-badge-label">待機</span>
                        <span class="wait-badge-count">${waitingGroups > 0 ? `${waitingGroups}組` : "0組"}</span>
                    </div>
                </div>
            </div>
            <div class="room-dashboard-summary">
                <div class="room-dashboard-grid room-dashboard-grid-reception">
                    ${laneVisuals.map((lane, index) => `
                        <div class="lane-tile lane-tile-summary ${lane.tileClass}">
                            <span class="lane-tile-number">レーン ${lane.laneNumber}</span>
                            <span class="lane-tile-status">
                                <span class="inline-flex">${lane.icon}</span>
                                <span>${lane.label}</span>
                            </span>
                        </div>
                    `).join("")}
                </div>
                <button
                    data-action="open-room-guiding"
                    data-roomid="${room.id}"
                    class="reception-room-action ${availableLanes > 0 ? "reception-room-action-ready" : "reception-room-action-muted"}"
                    ${availableLanes > 0 ? "" : "disabled"}>
                    ${availableLanes > 0 ? "空きレーンを選択" : "空きなし"}
                </button>
            </div>
        `;
        dom.receptionList.appendChild(roomElement);
    });
}
/**
 * ★新規追加: 受付画面でレーンタイルをクリックした際に表示されるモーダル
 * (レーン担当者画面のmodalと似た構造ですが、受付用は操作に特化させます)
 */
export async function openReceptionRoomModal(context, roomId) {
    if (!hasRole(context, ["root", "admin", "reception"])) {
        showToast({ title: "権限不足", message: "受付権限を持つメンバーのみ操作できます。", tone: "warning" });
        return;
    }
    const { db, dom, paths, state } = context;
    const room = state.dynamicAppConfig.rooms.find((item) => item.id === roomId);
    if (!room) {
        showToast({ title: "部屋未検出", message: "部屋情報が見つかりません。", tone: "error" });
        return;
    }
    const config = state.dynamicAppConfig;
    const laneSnapshot = await getDocs(query(collection(db, paths.lanesCollectionPath), where("roomId", "==", roomId)));
    const roomLanes = laneSnapshot.docs
        .map((laneDoc) => ({
        docId: laneDoc.id,
        data: laneDoc.data()
    }))
        .sort((left, right) => left.data.laneNum - right.data.laneNum);
    let selectedLaneIds = new Set();
    let selectedOptions = [];
    let receptionNotes = "";
    dom.receptionModalTitle.textContent = `${room.name} のレーン選択`;
    const closeModal = () => {
        dom.receptionLaneModal.classList.add("hidden");
    };
    dom.receptionLaneModal.classList.remove("hidden");
    dom.receptionModalCloseBtn.onclick = closeModal;
    dom.receptionLaneModal.onclick = (event) => {
        if (event.target === dom.receptionLaneModal) {
            closeModal();
        }
    };
    const renderModalContent = () => {
        dom.receptionModalContent.innerHTML = `
            <div class="reception-modal-grid">
                <div class="reception-modal-section">
                    <h4 class="reception-modal-section-title">案内するレーン</h4>
                    <div class="reception-modal-lane-grid">
                        ${roomLanes.map((lane) => {
            const laneName = escapeHtml(lane.data.customName || `レーン ${lane.data.laneNum}`);
            const effectiveState = getEffectiveLaneState(lane.data);
            const stateLabel = effectiveState === "guiding"
                ? "案内中"
                : effectiveState === "available"
                    ? "空き"
                    : effectiveState === "occupied"
                        ? "使用中"
                        : effectiveState === "preparing"
                            ? "準備中"
                            : "休止中";
            const stateIcon = effectiveState === "guiding"
                ? STATUS_ICON_SVGS.guiding
                : effectiveState === "available"
                    ? STATUS_ICON_SVGS.available
                    : effectiveState === "occupied"
                        ? STATUS_ICON_SVGS.occupied
                        : effectiveState === "preparing"
                            ? STATUS_ICON_SVGS.preparing
                            : STATUS_ICON_SVGS.paused;
            const isSelectable = effectiveState === "available";
            const isSelected = selectedLaneIds.has(lane.docId);
            return `
                                <button
                                    type="button"
                                    data-reception-select-lane="${lane.docId}"
                                    class="reception-modal-lane-card reception-modal-lane-card-${effectiveState}${isSelected ? " is-selected" : ""}"
                                    ${isSelectable ? "" : "disabled"}>
                                    <span class="reception-modal-lane-name">${laneName}</span>
                                    <span class="reception-modal-lane-status">
                                        <span class="inline-flex">${stateIcon}</span>
                                        <span>${stateLabel}</span>
                                    </span>
                                </button>
                            `;
        }).join("")}
                    </div>
                </div>

                <div class="reception-modal-section">
                    <h4 class="reception-modal-section-title">オプション選択</h4>
                    <div class="reception-modal-options">
                        ${config.options.length > 0
            ? config.options.map((option) => `
                                <label class="reception-modal-option-row">
                                    <input
                                        type="checkbox"
                                        class="reception-opt-chk accent-blue-600"
                                        value="${escapeHtml(option.name)}"
                                        ${selectedOptions.includes(option.name) ? "checked" : ""}>
                                    <span class="truncate">${escapeHtml(option.name)}</span>
                                </label>
                            `).join("")
            : '<p class="text-xs text-slate-400">オプションは設定されていません。</p>'}
                    </div>
                </div>
            </div>

            <div class="reception-modal-section">
                <label for="reception-modal-notes" class="reception-modal-section-title">備考 (任意)</label>
                <input
                    type="text"
                    id="reception-modal-notes"
                    class="w-full px-4 py-3 text-sm"
                    placeholder="例: 人数、特徴など"
                    value="${escapeHtml(receptionNotes)}">
            </div>

            <div class="reception-modal-selection-meta">
                <span class="reception-modal-selection-count">
                    選択中 ${selectedLaneIds.size} レーン
                </span>
            </div>

            <button
                id="reception-modal-start-btn"
                class="ui-button ui-button-primary ui-button-block reception-modal-submit disabled:cursor-not-allowed disabled:opacity-50"
                ${selectedLaneIds.size > 0 ? "" : "disabled"}>
                <span class="mr-2 inline-flex">${STATUS_ICON_SVGS.guiding}</span>選択レーンを案内中にする
            </button>
        `;
        dom.receptionModalContent.querySelectorAll("[data-reception-select-lane]").forEach((button) => {
            button.onclick = () => {
                const laneId = button.dataset.receptionSelectLane || "";
                if (!laneId) {
                    return;
                }
                if (selectedLaneIds.has(laneId)) {
                    selectedLaneIds.delete(laneId);
                }
                else {
                    selectedLaneIds.add(laneId);
                }
                renderModalContent();
            };
        });
        dom.receptionModalContent.querySelectorAll(".reception-opt-chk").forEach((checkbox) => {
            checkbox.onchange = () => {
                selectedOptions = Array.from(dom.receptionModalContent.querySelectorAll(".reception-opt-chk:checked"))
                    .map((item) => item.value);
            };
        });
        const notesInput = dom.receptionModalContent.querySelector("#reception-modal-notes");
        if (notesInput) {
            notesInput.oninput = () => {
                receptionNotes = notesInput.value;
            };
        }
        const startButton = dom.receptionModalContent.querySelector("#reception-modal-start-btn");
        if (startButton) {
            startButton.onclick = async () => {
                const targetLaneIds = Array.from(selectedLaneIds);
                if (targetLaneIds.length === 0) {
                    return;
                }
                startButton.disabled = true;
                startButton.innerHTML = `<span class="mr-2 inline-flex">${UI_ICON_SVGS.spinner}</span>処理中...`;
                const results = await Promise.all(targetLaneIds.map((laneId) => updateReceptionStatus(context, laneId, "guiding", null, selectedOptions, receptionNotes.trim() || null, true)));
                const failedCount = results.filter((result) => !result).length;
                if (failedCount > 0) {
                    showToast({
                        title: "一部失敗",
                        message: `${targetLaneIds.length}レーン中 ${failedCount}レーンの案内開始に失敗しました。最新状態を確認して再度実行してください。`,
                        tone: "warning"
                    });
                }
                else {
                    showToast({
                        title: "案内開始",
                        message: `${targetLaneIds.length}レーンを案内中にしました。`,
                        tone: "success"
                    });
                    closeModal();
                }
            };
        }
    };
    renderModalContent();
}
/**
 * レーン担当用ビュー (部屋選択) を描画
 */
export function renderStaffRoomSelect(context) {
    const { dom } = context;
    const visibleRooms = getVisibleRooms(context);
    const currentSelectedRoom = dom.staffRoomSelect.value;
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
export function renderStaffLaneDashboard(context, selectedRoomId) {
    const { dom, state } = context;
    const config = state.dynamicAppConfig;
    dom.staffLaneDashboard.innerHTML = "";
    if (!canAccessTab(context, "staff")) {
        dom.staffLaneDashboard.innerHTML = '<div class="app-surface px-6 py-10 text-center text-slate-500">レーン担当権限を持つメンバーのみ表示できます。</div>';
        return;
    }
    if (!selectedRoomId) {
        dom.staffLaneDashboard.innerHTML = getVisibleRooms(context).length === 0
            ? '<div class="app-surface px-6 py-10 text-center text-slate-500">操作できる部屋がありません。管理設定で部屋を確認してください。</div>'
            : '<div class="app-surface px-6 py-10 text-center text-slate-500">上部のセレクトから操作する部屋を選択してください。</div>';
        return;
    }
    if (!canManageRoom(context, selectedRoomId)) {
        dom.staffLaneDashboard.innerHTML = '<div class="app-surface px-6 py-10 text-center text-slate-500">この部屋は操作できません。権限設定を確認してください。</div>';
        return;
    }
    const selectedRoom = config.rooms.find((room) => room.id === selectedRoomId);
    const currentState = getRoomStateSnapshot(context, selectedRoomId, selectedRoom?.lanes || 0);
    const currentWaitingGroups = Number(currentState.waitingGroups || 0);
    const waitControlElement = document.createElement("div");
    waitControlElement.className = "wait-control-card mb-6";
    waitControlElement.innerHTML = `
        <div class="wait-control-shell">
            <div class="wait-control-grid">
                <div class="wait-control-panel wait-control-room-slot" data-room-select-slot></div>
                <div class="wait-control-panel wait-control-panel-counter">
                    <div class="wait-control-panel-title">待機組数</div>
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
            </div>
        </div>
    `;
    const roomSelectSlot = waitControlElement.querySelector("[data-room-select-slot]");
    if (roomSelectSlot instanceof HTMLElement) {
        const roomPicker = document.createElement("div");
        roomPicker.className = "wait-control-room";
        roomPicker.innerHTML = `
            <div class="wait-control-panel-title">操作する部屋</div>
        `;
        dom.staffRoomSelect.className = "wait-control-select";
        roomPicker.appendChild(dom.staffRoomSelect);
        roomSelectSlot.appendChild(roomPicker);
    }
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
        const pauseReason = laneData.pauseReasonId
            ? config.pauseReasons.find((item) => item.id === laneData.pauseReasonId) || null
            : null;
        const laneStatusDisplay = escapeHtml(laneData.status === "paused" && pauseReason
            ? pauseReason.name
            : laneStatusConfig.name || "不明");
        const laneStatusTone = `lane-current-status lane-current-status-${escapeHtml(laneData.status || "paused")}`;
        let receptionStatusDisplay = "";
        let arrivalButton = "";
        let optionsDisplay = "";
        let notesDisplay = "";
        if (laneData.receptionStatus === "guiding") {
            receptionStatusDisplay = "受付状態: お客様 案内中";
            arrivalButton = `
                <button data-action="confirm-arrival" data-docid="${docId}"
                        class="ui-button ui-button-success ui-button-block">
                    <span class="mr-2 inline-flex">${UI_ICON_SVGS.arrival}</span>お客様 到着確認
                </button>
            `;
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
        }
        else if (laneData.receptionStatus === "guiding" && (laneData.selectedOptions?.length || laneData.receptionNotes)) {
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
        const primaryStatusButtons = config.laneStatuses.filter((status) => status.id !== "paused").map((status) => {
            const isCurrent = laneData.status === status.id;
            return `
                <button data-action="set-lane-status" data-docid="${docId}" data-status="${status.id}" 
                        class="status-action-button ${isCurrent
                ? `status-action-active ${status.colorClass}`
                : "status-action-idle"}">
                    <span class="inline-flex">${status.icon}</span>${status.name}
                </button>
            `;
        }).join("");
        const pauseStatus = config.laneStatuses.find((status) => status.id === "paused");
        const pauseButton = pauseStatus ? `
            <button data-action="set-lane-status" data-docid="${docId}" data-status="${pauseStatus.id}" 
                    class="status-action-button status-action-pause-row ${laneData.status === pauseStatus.id
            ? `status-action-active ${pauseStatus.colorClass}`
            : "status-action-idle"}">
                <span class="inline-flex">${pauseStatus.icon}</span>${pauseStatus.name}
            </button>
        ` : "";
        const pauseReasonsOptionsHtml = (config.pauseReasons || []).map((reason) => `<option value="${reason.id}" ${laneData.pauseReasonId === reason.id ? "selected" : ""}>${escapeHtml(reason.name)}</option>`).join("");
        const pauseReasonSelect = `
            <div id="pause-reason-div-${docId}" class="${laneData.status === "paused" ? "lane-pause-panel" : "hidden"}">
                <label for="pause-reason-select-${docId}" class="lane-pause-label">休止理由</label>
                <select id="pause-reason-select-${docId}" data-action="set-pause-reason" data-docid="${docId}" 
                        class="block w-full px-4 py-3 text-sm">
                    <option value="">--- 理由を選択 ---</option>
                    ${pauseReasonsOptionsHtml}
                </select>
            </div>
        `;
        laneElement.innerHTML = `
            <div class="lane-card-header">
                <div class="w-full">
                    <div class="lane-card-title-row">
                        <h4 class="lane-card-title">${laneDisplayName}</h4>
                        <span class="${laneStatusTone}">
                            <span class="inline-flex">${laneStatusConfig.icon || STATUS_ICON_SVGS.paused}</span>
                            <span>${laneStatusDisplay}</span>
                        </span>
                    </div>
                    <p class="lane-card-subtext">${staffNameDisplay}</p>
                    ${receptionStatusDisplay ? `<p class="lane-card-aux">${receptionStatusDisplay}</p>` : ""}
                </div>
            </div>

            ${optionsDisplay}

            ${notesDisplay}

            ${arrivalButton}
            
            <div class="lane-card-actions">
                <p class="mb-3 text-sm font-bold text-slate-700">レーンの状況を変更</p>
                <div class="status-action-grid">
                    ${primaryStatusButtons}
                </div>
                ${pauseButton}
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
export function renderAdminSettings(context) {
    const { dom, state } = context;
    const config = state.localAdminConfig;
    dom.adminEventNameInput.value = config.eventName || "";
    dom.adminRoomList.innerHTML = "";
    if (!config.rooms || config.rooms.length === 0) {
        dom.adminRoomList.innerHTML = '<p class="text-gray-400 text-sm">部屋がありません。</p>';
    }
    config.rooms.forEach((room) => {
        const roomElement = document.createElement("div");
        roomElement.className = "admin-inline-row";
        roomElement.innerHTML = `
            <input type="text" data-action="edit-room-name" data-id="${room.id}" value="${room.name}" 
                   class="admin-inline-input flex-grow min-w-0 sm:text-sm"
                   placeholder="部屋名">
            
            <div class="admin-inline-meta flex items-center flex-shrink-0">
                <span class="text-xs text-slate-500 mr-1 hidden sm:inline">レーン数:</span>
                <input type="number" data-action="edit-room-lanes" data-id="${room.id}" value="${room.lanes}" min="1" 
                       class="admin-inline-input w-12 sm:w-16 px-1 sm:px-2 sm:text-sm text-center">
            </div>

            <button data-action="delete-room" data-id="${room.id}" 
                    class="admin-delete-button ml-1 sm:ml-2"
                    title="削除">
                ${UI_ICON_SVGS.trash}
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
        optionElement.className = "admin-inline-row";
        optionElement.innerHTML = `
            <input type="text" data-action="edit-option-name" data-id="${option.id}" value="${option.name}" class="admin-inline-input flex-grow min-w-0 sm:text-sm">
            <button data-action="delete-option" data-id="${option.id}" class="admin-delete-button">
                ${UI_ICON_SVGS.trash}
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
        reasonElement.className = "admin-inline-row";
        reasonElement.innerHTML = `
            <input type="text" data-action="edit-pause-reason-name" data-id="${reason.id}" value="${reason.name}" class="admin-inline-input flex-grow min-w-0 sm:text-sm">
            <button data-action="delete-pause-reason" data-id="${reason.id}" class="admin-delete-button">
                ${UI_ICON_SVGS.trash}
            </button>
        `;
        dom.adminPauseReasonsList.appendChild(reasonElement);
    });
    renderReceptionLayoutEditor({
        container: dom.adminLayoutEditorRoot,
        rooms: config.rooms,
        layout: config.receptionLayout,
        onChange: (nextLayout) => {
            state.localAdminConfig.receptionLayout = nextLayout;
        }
    });
}
/**
 * 管理設定タブ (レーン名カスタム) を描画
 */
export function renderAdminLaneNames(context) {
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
        roomGroupElement.innerHTML = `<h4 class="admin-lane-room-title mb-2">${room.name}</h4>`;
        const lanesList = document.createElement("div");
        lanesList.className = "space-y-2 pl-2";
        roomLanes.forEach((lane) => {
            const laneElement = document.createElement("div");
            laneElement.className = "admin-inline-row admin-inline-row-tight";
            laneElement.innerHTML = `
                    <label class="w-20 text-sm text-slate-600">レーン ${lane.data.laneNum}:</label>
                    <input type="text" data-action="edit-custom-name" data-docid="${lane.docId}" 
                            value="${lane.data.customName || ""}" 
                            class="admin-inline-input flex-grow sm:text-sm" 
                            placeholder="カスタム名 (例: 小学生レーン)">
                    <button data-action="save-custom-name" data-docid="${lane.docId}" 
                            class="ui-button ui-button-primary admin-inline-save-button">
                        <span class="inline-flex">${UI_ICON_SVGS.save}</span>保存
                    </button>
                `;
            lanesList.appendChild(laneElement);
        });
        roomGroupElement.appendChild(lanesList);
        dom.adminLaneList.appendChild(roomGroupElement);
    });
}
