export type RoleId = "root" | "admin" | "reception" | "staff";
export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type TabId = "reception" | "staff" | "admin" | "members" | "database";
export type AuthorizationSource = "manual" | "roster" | "global";
export type MemberSortMode = "grade-asc" | "grade-desc" | "role" | "name";

export interface RoomConfig {
    id: string;
    name: string;
    lanes: number;
}

export interface LaneStatusConfig {
    id: string;
    name: string;
    colorClass: string;
    icon: string;
}

export interface ReceptionStatusConfig {
    id: string;
    name: string;
    colorClass: string;
    icon: string;
}

export interface NamedOption {
    id: string;
    name: string;
}

export interface ReceptionRoomLayout {
    roomId: string;
    order: number;
    widthRatio: number;
    tileColumns: number;
    x?: number;
    y?: number;
    w?: number;
}

export interface ReceptionLayoutConfig {
    version: number;
    rooms: ReceptionRoomLayout[];
}

export interface AppConfig {
    eventName: string;
    rooms: RoomConfig[];
    laneStatuses: LaneStatusConfig[];
    receptionStatuses: ReceptionStatusConfig[];
    options: NamedOption[];
    pauseReasons: NamedOption[];
    receptionLayout?: ReceptionLayoutConfig;
}

export interface AccessMember {
    uid: string;
    email: string;
    displayName: string;
    grade?: string | null;
    role: RoleId;
    isActive: boolean;
    assignedRoomIds: string[];
    authorizationSource?: AuthorizationSource | null;
    createdAt?: unknown;
    updatedAt?: unknown;
    lastLoginAt?: unknown;
    [key: string]: unknown;
}

export interface AccessRequest {
    uid: string;
    email: string;
    displayName: string;
    status: AccessRequestStatus;
    note?: string | null;
    requestedAt?: unknown;
    lastSeenAt?: unknown;
    updatedAt?: unknown;
    [key: string]: unknown;
}

export interface MemberDirectoryEntry {
    emailKey: string;
    email: string;
    displayName: string;
    grade: string | null;
    source: AuthorizationSource;
    importedAt?: unknown;
    updatedAt?: unknown;
    [key: string]: unknown;
}

export interface MemberDirectoryImportResult {
    importedCount: number;
    removedDirectoryCount: number;
    syncedMemberCount: number;
    autoApprovedCount: number;
    deactivatedCount: number;
    protectedExistingCount: number;
    skippedExistingCount: number;
}

export interface LaneData {
    roomId: string;
    roomName?: string;
    laneNum: number;
    status: string;
    receptionStatus?: string;
    selectedOptions?: string[];
    staffName?: string | null;
    customName?: string | null;
    receptionNotes?: string | null;
    pauseReasonId?: string | null;
    revision?: number;
    updatedAt?: unknown;
    [key: string]: unknown;
}

export interface RoomStateData {
    waitingGroups?: number;
    totalLanes?: number;
    availableLanes?: number;
    occupiedLanes?: number;
    preparingLanes?: number;
    pausedLanes?: number;
    guidingLanes?: number;
    updatedAt?: unknown;
    [key: string]: unknown;
}

export interface RegistryItem {
    appId: string;
    roomSummary?: string;
    totalLanes?: number;
    lastUpdated?: {
        toDate?: () => Date;
    };
    dateObj?: Date;
    dateStr?: string;
    [key: string]: unknown;
}

export interface FirestorePaths {
    configPath: string;
    lanesCollectionPath: string;
    roomStateCollectionPath: string;
    registryCollectionPath: string;
    globalAccessMembersCollectionPath: string;
    globalAccessMemberDocPath: string;
    memberDirectoryCollectionPath: string;
    accessMembersCollectionPath: string;
    accessMemberDocPath: string;
    accessRequestsCollectionPath: string;
    accessRequestDocPath: string;
}

export interface DomRefs {
    appShell: HTMLElement;
    headerTabsShell: HTMLElement;
    themeToggleBtn: HTMLButtonElement;
    themeToggleIcon: HTMLElement;
    authLoginCard: HTMLElement;
    authPendingCard: HTMLElement;
    authManualRequestForm: HTMLElement;
    authManualDisplayNameInput: HTMLInputElement;
    authManualRequestSubmitBtn: HTMLButtonElement;
    tabsMenuToggle: HTMLButtonElement;
    tabsMenuLabel: HTMLElement;
    authStatusText: HTMLElement;
    authUserName: HTMLElement;
    authUserEmail: HTMLElement;
    authRoleBadge: HTMLElement;
    authPendingMessage: HTMLElement;
    authSignInBtn: HTMLButtonElement;
    authSignOutBtn: HTMLButtonElement;
    tabs: HTMLElement;
    tabContents: HTMLElement;
    authAccountCard: HTMLElement;
    statusBannerToggleBtn: HTMLButtonElement;
    receptionList: HTMLElement;
    staffRoomSelect: HTMLSelectElement;
    staffLaneDashboard: HTMLElement;
    firestoreStatus: HTMLElement;
    globalEventDisplay: HTMLElement;
    globalEventNameText: HTMLElement;
    globalAppIdText: HTMLElement;
    summarySection: HTMLElement;
    summaryToggleBtn: HTMLButtonElement;
    adminEventNameInput: HTMLInputElement;
    adminDirectoryImportFile: HTMLInputElement;
    adminDirectoryImportBtn: HTMLButtonElement;
    adminDirectoryImportStatus: HTMLElement;
    adminAccessRequestList: HTMLElement;
    adminMemberList: HTMLElement;
    dbSearchInput: HTMLInputElement;
    dbEventList: HTMLElement;
    dbRefreshBtn: HTMLButtonElement;
    dbExportBtn: HTMLButtonElement;
    dbImportFile: HTMLInputElement;
    receptionLaneModal: HTMLElement;
    receptionModalCloseBtn: HTMLButtonElement;
    receptionModalTitle: HTMLElement;
    receptionModalContent: HTMLElement;
    adminRoomList: HTMLElement;
    adminLayoutEditorRoot: HTMLElement;
    adminNewRoomInput: HTMLInputElement;
    adminNewRoomLanesInput: HTMLInputElement;
    adminAddRoomBtn: HTMLButtonElement;
    adminOptionsList: HTMLElement;
    adminNewOptionInput: HTMLInputElement;
    adminAddOptionBtn: HTMLButtonElement;
    adminSaveSettingsBtn: HTMLButtonElement;
    adminSaveStatus: HTMLElement;
    adminPauseReasonsList: HTMLElement;
    adminNewPauseReasonInput: HTMLInputElement;
    adminAddPauseReasonBtn: HTMLButtonElement;
    adminLaneList: HTMLElement;
    tabAdmin: HTMLElement;
    tabMembers: HTMLElement;
    roomSummaryBar: HTMLElement;
    lblCurrentAppId: HTMLElement;
    inputNewAppId: HTMLInputElement;
    btnSwitchOnly: HTMLButtonElement;
    btnCopySwitch: HTMLButtonElement;
}

export interface AppState {
    userId: string | null;
    authUser: any | null;
    initialAuthToken: string | null;
    isUiInitialized: boolean;
    renderScheduled: boolean;
    activeTab: TabId;
    isNavMenuOpen: boolean;
    isStatusBannerCollapsed: boolean;
    isSummaryCollapsed: boolean;
    memberSortMode: MemberSortMode;
    memberBulkGrade: string;
    memberBulkRole: RoleId;
    memberBulkIsActive: boolean;
    memberBulkSelectedUids: string[];
    currentLanesState: Record<string, LaneData>;
    currentRoomState: Record<string, RoomStateData>;
    dynamicAppConfig: AppConfig;
    localAdminConfig: AppConfig;
    eventAccessMember: AccessMember | null;
    accessMember: AccessMember | null;
    selfAccessRequest: AccessRequest | null;
    accessMembersCache: AccessMember[];
    accessRequestsCache: AccessRequest[];
    waitingGroupLocalTargets: Record<string, number>;
    waitingGroupInFlightTargets: Record<string, number>;
    waitingGroupSyncTimers: Record<string, number>;
    waitingGroupSyncInFlight: Record<string, boolean>;
    isDbMigrating: boolean;
    registryCache: RegistryItem[];
    globalAccessMember: AccessMember | null;
    unsubscribeLanes: (() => void) | null;
    unsubscribeConfig: (() => void) | null;
    unsubscribeRoomState: (() => void) | null;
    unsubscribeGlobalAccessMember: (() => void) | null;
    unsubscribeAccessMember: (() => void) | null;
    unsubscribeAccessRequest: (() => void) | null;
    unsubscribeAccessMembers: (() => void) | null;
    unsubscribeAccessRequests: (() => void) | null;
}

export interface AppContext {
    db: any;
    auth: any;
    currentAppId: string;
    paths: FirestorePaths;
    dom: DomRefs;
    state: AppState;
}
