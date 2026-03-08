import { APP_ID } from "./env.js";
import { auth, db } from "./firebase-config.js";
import { APP_CONFIG } from "./default-config.js";
import type { AppConfig, AppContext, AppState, DomRefs } from "./types.js";

function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Required element not found: #${id}`);
    }
    return element as T;
}

export function cloneConfig(config: AppConfig): AppConfig {
    return JSON.parse(JSON.stringify(config));
}

function createDomRefs(): DomRefs {
    return {
        appShell: requireElement("app-shell"),
        authLoginCard: requireElement("auth-login-card"),
        authPendingCard: requireElement("auth-pending-card"),
        authStatusText: requireElement("auth-status-text"),
        authUserName: requireElement("auth-user-name"),
        authUserEmail: requireElement("auth-user-email"),
        authRoleBadge: requireElement("auth-role-badge"),
        authPendingMessage: requireElement("auth-pending-message"),
        authSignInBtn: requireElement("auth-sign-in-btn"),
        authSignOutBtn: requireElement("auth-sign-out-btn"),
        tabs: requireElement("tabs"),
        tabContents: requireElement("tab-content"),
        receptionList: requireElement("reception-list"),
        staffRoomSelect: requireElement("staff-room-select"),
        staffLaneDashboard: requireElement("staff-lane-dashboard"),
        staffNameInput: requireElement("staff-name"),
        firestoreStatus: requireElement("firestore-status"),
        globalEventDisplay: requireElement("global-event-display"),
        globalEventNameText: requireElement("global-event-name-text"),
        globalAppIdText: requireElement("global-appid-text"),
        adminEventNameInput: requireElement("admin-event-name-input"),
        adminDirectoryImportFile: requireElement("admin-directory-import-file"),
        adminDirectoryImportBtn: requireElement("admin-directory-import-btn"),
        adminDirectoryImportStatus: requireElement("admin-directory-import-status"),
        adminAccessRequestList: requireElement("admin-access-request-list"),
        adminMemberList: requireElement("admin-member-list"),
        dbSearchInput: requireElement("db-search-input"),
        dbEventList: requireElement("db-event-list"),
        dbRefreshBtn: requireElement("db-refresh-btn"),
        dbExportBtn: requireElement("db-export-btn"),
        dbImportFile: requireElement("db-import-file"),
        receptionLaneModal: requireElement("reception-lane-modal"),
        receptionModalCloseBtn: requireElement("reception-modal-close-btn"),
        receptionModalTitle: requireElement("reception-modal-title"),
        receptionModalContent: requireElement("reception-modal-content"),
        adminRoomList: requireElement("admin-room-list"),
        adminNewRoomInput: requireElement("admin-new-room-input"),
        adminNewRoomLanesInput: requireElement("admin-new-room-lanes-input"),
        adminAddRoomBtn: requireElement("admin-add-room-btn"),
        adminOptionsList: requireElement("admin-options-list"),
        adminNewOptionInput: requireElement("admin-new-option-input"),
        adminAddOptionBtn: requireElement("admin-add-option-btn"),
        adminSaveSettingsBtn: requireElement("admin-save-settings-btn"),
        adminSaveStatus: requireElement("admin-save-status"),
        adminPauseReasonsList: requireElement("admin-pause-reasons-list"),
        adminNewPauseReasonInput: requireElement("admin-new-pause-reason-input"),
        adminAddPauseReasonBtn: requireElement("admin-add-pause-reason-btn"),
        adminLaneList: requireElement("admin-lane-list"),
        tabAdmin: requireElement("tab-admin"),
        roomSummaryBar: requireElement("room-summary-bar"),
        lblCurrentAppId: requireElement("lbl-current-appid"),
        inputNewAppId: requireElement("input-new-app-id"),
        btnSwitchOnly: requireElement("btn-switch-only"),
        btnCopySwitch: requireElement("btn-copy-switch")
    };
}

function createInitialState(): AppState {
    return {
        userId: null,
        authUser: null,
        initialAuthToken: typeof __initial_auth_token !== "undefined" ? __initial_auth_token : null,
        isUiInitialized: false,
        renderScheduled: false,
        activeTab: "staff",
        currentLanesState: {},
        currentRoomState: {},
        dynamicAppConfig: cloneConfig(APP_CONFIG),
        localAdminConfig: cloneConfig(APP_CONFIG),
        accessMember: null,
        selfAccessRequest: null,
        accessMembersCache: [],
        accessRequestsCache: [],
        isDbMigrating: false,
        registryCache: [],
        unsubscribeLanes: null,
        unsubscribeConfig: null,
        unsubscribeRoomState: null,
        unsubscribeAccessMember: null,
        unsubscribeAccessRequest: null,
        unsubscribeAccessMembers: null,
        unsubscribeAccessRequests: null
    };
}

export function createAppContext(): AppContext {
    const urlParams = new URLSearchParams(window.location.search);
    const currentAppId = urlParams.get("app_id") || APP_ID;
    const privateBase = `/artifacts/${currentAppId}/private/data`;
    const memberDirectoryCollectionPath = `${privateBase}/memberDirectory`;
    const accessMembersCollectionPath = `${privateBase}/accessMembers`;
    const accessRequestsCollectionPath = `${privateBase}/accessRequests`;

    return {
        db,
        auth,
        currentAppId,
        paths: {
            configPath: `/artifacts/${currentAppId}/public/data/config/appConfig`,
            lanesCollectionPath: `/artifacts/${currentAppId}/public/data/lanes`,
            roomStateCollectionPath: `/artifacts/${currentAppId}/public/data/roomState`,
            registryCollectionPath: "sys_registry",
            memberDirectoryCollectionPath,
            accessMembersCollectionPath,
            accessMemberDocPath: `${accessMembersCollectionPath}/__SELF__`,
            accessRequestsCollectionPath,
            accessRequestDocPath: `${accessRequestsCollectionPath}/__SELF__`
        },
        dom: createDomRefs(),
        state: createInitialState()
    };
}
