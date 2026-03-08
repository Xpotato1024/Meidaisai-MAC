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

export interface AppConfig {
    eventName: string;
    rooms: RoomConfig[];
    laneStatuses: LaneStatusConfig[];
    receptionStatuses: ReceptionStatusConfig[];
    options: NamedOption[];
    pauseReasons: NamedOption[];
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
    updatedAt?: unknown;
    [key: string]: unknown;
}

export interface RoomStateData {
    waitingGroups?: number;
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
}

export interface DomRefs {
    tabs: HTMLElement;
    tabContents: HTMLElement;
    receptionList: HTMLElement;
    staffRoomSelect: HTMLSelectElement;
    staffLaneDashboard: HTMLElement;
    staffNameInput: HTMLInputElement;
    firestoreStatus: HTMLElement;
    globalEventDisplay: HTMLElement;
    globalEventNameText: HTMLElement;
    globalAppIdText: HTMLElement;
    adminEventNameInput: HTMLInputElement;
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
    roomSummaryBar: HTMLElement;
    lblCurrentAppId: HTMLElement;
    inputNewAppId: HTMLInputElement;
    btnSwitchOnly: HTMLButtonElement;
    btnCopySwitch: HTMLButtonElement;
}

export interface AppState {
    userId: string | null;
    initialAuthToken: string | null;
    isUiInitialized: boolean;
    currentLanesState: Record<string, LaneData>;
    currentRoomState: Record<string, RoomStateData>;
    dynamicAppConfig: AppConfig;
    localAdminConfig: AppConfig;
    isDbMigrating: boolean;
    registryCache: RegistryItem[];
    unsubscribeLanes: (() => void) | null;
    unsubscribeConfig: (() => void) | null;
    unsubscribeRoomState: (() => void) | null;
}

export interface AppContext {
    db: any;
    auth: any;
    currentAppId: string;
    paths: FirestorePaths;
    dom: DomRefs;
    state: AppState;
}
