import type { AppContext, RoleId, RoomConfig, TabId } from "./types.js";

export const ROLE_LABELS: Record<RoleId, string> = {
    admin: "管理者",
    reception: "受付",
    staff: "レーン担当"
};

export function hasApprovedAccess(context: AppContext): boolean {
    const member = context.state.accessMember;
    return Boolean(member && member.isActive);
}

export function hasRole(context: AppContext, roles: RoleId[]): boolean {
    const member = context.state.accessMember;
    return Boolean(member && member.isActive && roles.includes(member.role));
}

export function canAccessTab(context: AppContext, tabId: TabId): boolean {
    if (tabId === "admin" || tabId === "database") {
        return hasRole(context, ["admin"]);
    }
    if (tabId === "reception") {
        return hasRole(context, ["admin", "reception"]);
    }
    if (tabId === "staff") {
        return hasRole(context, ["admin", "staff"]);
    }
    return false;
}

export function getDefaultTab(context: AppContext): TabId {
    const candidates: TabId[] = ["reception", "staff", "admin", "database"];
    return candidates.find((tabId) => canAccessTab(context, tabId)) || "staff";
}

export function getAllowedRoomIds(context: AppContext): string[] {
    const allRoomIds = context.state.dynamicAppConfig.rooms.map((room) => room.id);
    if (hasRole(context, ["admin", "reception"])) {
        return allRoomIds;
    }

    const assignedRoomIds = context.state.accessMember?.assignedRoomIds || [];
    return allRoomIds.filter((roomId) => assignedRoomIds.includes(roomId));
}

export function canManageRoom(context: AppContext, roomId: string): boolean {
    if (hasRole(context, ["admin"])) {
        return true;
    }
    return hasRole(context, ["staff"]) && getAllowedRoomIds(context).includes(roomId);
}

export function getVisibleRooms(context: AppContext): RoomConfig[] {
    const allowedRoomIds = new Set(getAllowedRoomIds(context));
    return context.state.dynamicAppConfig.rooms.filter((room) => allowedRoomIds.has(room.id));
}
