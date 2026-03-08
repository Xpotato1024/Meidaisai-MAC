// public/js/main.js

import { db, auth, setPersistence, inMemoryPersistence } from "./firebase-config.js";
import { APP_ID, ADMIN_PASSWORD } from "./env.js";

// ★その他のFirebase機能はCDNから直接読み込む
import { 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { 
    doc, getDoc, setDoc, updateDoc, deleteDoc, 
    onSnapshot, collection, query, getDocs, 
    writeBatch, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- アプリケーション設定 ---
const APP_CONFIG = {
    eventName: "名称未設定イベント",
    // 部屋と各部屋のレーン数
    rooms: [
        { id: "room1", name: "A部屋", lanes: 4 },
        { id: "room2", name: "B部屋", lanes: 3 },
        { id: "room3", name: "C部屋", lanes: 2 }
    ],
    // レーン担当者が設定するステータス
    laneStatuses: [
        { id: "available", name: "空き", colorClass: "status-available", icon: "🟢" },
        { id: "occupied", name: "使用中", colorClass: "status-occupied", icon: "🔴" },
        { id: "preparing", name: "準備中", colorClass: "status-preparing", icon: "🟡" },
        { id: "paused", name: "休止中", colorClass: "status-paused", icon: "⏸️" }
    ],
    // 受付が設定するステータス
    receptionStatuses: [
        { id: "available", name: "案内可", colorClass: "reception-available", icon: "✅" },
        { id: "guiding", name: "案内中", colorClass: "reception-guiding", icon: "🔀" }
    ],
    // オプション設定
    options: [
        { id: "opt1", name: "プランA" },
        { id: "opt2", name: "プランB" },
        { id: "opt3", name: "プランC" }
    ],
    // 休止理由
    pauseReasons: [
        { id: "reason1", name: "機材トラブル" },
        { id: "reason2", name: "清掃中" },
        { id: "reason3", name: "その他" }
    ]
};
// --- 設定ここまで ---


// --- グローバル変数 ---

// ★重要: ここで currentAppId を定義します
const urlParams = new URLSearchParams(window.location.search);

// URLに ?app_id=xxx があればそれを使い、なければ env.js の APP_ID を使う
const currentAppId = urlParams.get('app_id') || APP_ID;

// db, auth は import したものを使うのでここでの宣言は削除
let userId;
let initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firestoreのパス
const CONFIG_PATH = `/artifacts/${currentAppId}/public/data/config/appConfig`;
const LANES_COLLECTION_PATH = `/artifacts/${currentAppId}/public/data/lanes`;
const ROOM_STATE_COLLECTION_PATH = `/artifacts/${currentAppId}/public/data/roomState`;

const REGISTRY_COLLECTION_PATH = 'sys_registry'; // 全イベントの台帳

// Firestoreリスナー
let unsubscribeLanes = null;
let unsubscribeConfig = null;
let unsubscribeRoomState = null;

// 状態保持
let currentLanesState = {}; 
let currentRoomState = {}; 
let dynamicAppConfig = { ...APP_CONFIG }; 
let localAdminConfig = { ...APP_CONFIG }; 
let isDbMigrating = false;

// DOM要素
const tabs = document.getElementById('tabs');
const tabContents = document.getElementById('tab-content');
const receptionList = document.getElementById('reception-list');
const staffRoomSelect = document.getElementById('staff-room-select');
const staffLaneDashboard = document.getElementById('staff-lane-dashboard');
const staffNameInput = document.getElementById('staff-name');
const firestoreStatus = document.getElementById('firestore-status');
const AUTH_KEY = 'isAuthenticated';

// 管理タブのDOM要素
const globalEventDisplay = document.getElementById('global-event-display');
const globalEventNameText = document.getElementById('global-event-name-text');
const globalAppIdText = document.getElementById('global-appid-text');
const adminEventNameInput = document.getElementById('admin-event-name-input');

// 受付/データベースタブのDOM
const dbSearchInput = document.getElementById('db-search-input');
const dbEventList = document.getElementById('db-event-list');
const dbRefreshBtn = document.getElementById('db-refresh-btn');
const dbExportBtn = document.getElementById('db-export-btn');
const dbImportFile = document.getElementById('db-import-file');

// 受付用モーダル関連
const receptionLaneModal = document.getElementById('reception-lane-modal');
const receptionModalCloseBtn = document.getElementById('reception-modal-close-btn');
const receptionModalTitle = document.getElementById('reception-modal-title');
const receptionModalContent = document.getElementById('reception-modal-content');

// 管理設定タブのDOM
const adminRoomList = document.getElementById('admin-room-list');
const adminNewRoomInput = document.getElementById('admin-new-room-input');
const adminNewRoomLanesInput = document.getElementById('admin-new-room-lanes-input');
const adminAddRoomBtn = document.getElementById('admin-add-room-btn');
const adminOptionsList = document.getElementById('admin-options-list');
const adminNewOptionInput = document.getElementById('admin-new-option-input');
const adminAddOptionBtn = document.getElementById('admin-add-option-btn');
const adminSaveSettingsBtn = document.getElementById('admin-save-settings-btn');
const adminSaveStatus = document.getElementById('admin-save-status');
const adminPauseReasonsList = document.getElementById('admin-pause-reasons-list');
const adminNewPauseReasonInput = document.getElementById('admin-new-pause-reason-input');
const adminAddPauseReasonBtn = document.getElementById('admin-add-pause-reason-btn');

/**
 * 受付/管理タブのアクセス認証チェック
 */
function checkAuthentication() {
    if (sessionStorage.getItem(AUTH_KEY) === 'true') {
        return true;
    }
    const inputPassword = prompt("受付・管理用のパスワードを入力してください:");
    if (inputPassword === ADMIN_PASSWORD) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        return true;
    } else if (inputPassword !== null && inputPassword !== "") {
        alert("パスワードが間違っています。");
        return false;
    }
    return false;
}

// --- 初期化 ---

/**
 * 認証状態の監視とメインロジックの開始
 */
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // ユーザーがログイン済み
            userId = user.uid;
            console.log(`Authenticated. UserID: ${userId}`);
            firestoreStatus.textContent = "✅ リアルタイム接続完了";
            firestoreStatus.className = "text-center text-xs text-green-600";

            // メインロジックを実行
            await initializeAppLogic();

        } else {
            // ユーザーが未ログイン
            console.log("Not authenticated. Attempting sign-in...");
            firestoreStatus.textContent = "認証中...";
            try {
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("認証エラー:", error);
                firestoreStatus.textContent = `認証エラー: ${error.message}`;
                firestoreStatus.className = "text-center text-red-500 font-bold";
            }
        }
    });
}

/**
 * アプリケーションのメインロジック（認証後に実行）
 */
async function initializeAppLogic() {
    if (!db) return;
    
    // 1. イベントリスナーを設定
    setupEventListeners();
    
    // 2. Firestoreから設定を監視
    listenToConfigChanges();
    
    // 3. Firestoreからレーン情報を監視
    listenToLaneChanges();

    // 4. Firestoreから部屋状態(待機)を監視
    listenToRoomStateChanges();
}

/**
 * データベースの初期化とマイグレーション
 */
async function checkAndInitDatabase(config) {
    try {
        console.log("Checking database structure based on config...");
        const lanesCollectionRef = collection(db, LANES_COLLECTION_PATH);
        const currentDocsSnapshot = await getDocs(lanesCollectionRef);
        
        const existingLanes = {}; 
        currentDocsSnapshot.forEach(doc => {
            const data = doc.data();
            if (!data.roomId) return;
            if (!existingLanes[data.roomId]) {
                existingLanes[data.roomId] = {};
            }
            existingLanes[data.roomId][data.laneNum] = doc.id;
        });

        const batch = writeBatch(db);
        let operationsCount = 0;
        const configRoomIds = new Set(config.rooms.map(r => r.id));

        for (const room of config.rooms) {
            const roomLanesInDb = existingLanes[room.id] || {};
            
            // 1a. レーンを追加・更新
            for (let i = 1; i <= room.lanes; i++) {
                if (roomLanesInDb[i]) {
                    // 既存レーン: 更新
                    const docId = roomLanesInDb[i];
                    const docRef = doc(db, LANES_COLLECTION_PATH, docId);
                    const docSnap = await getDoc(docRef);
                    
                    if (!docSnap.exists()) {
                        delete roomLanesInDb[i]; 
                        continue; 
                    }
                    const data = docSnap.data();

                    let updates = {};
                    if (data.roomName !== room.name) {
                        updates.roomName = room.name;
                    }
                    // マイグレーション
                    if (typeof data.receptionStatus === 'undefined') updates.receptionStatus = 'available';
                    if (typeof data.selectedOptions === 'undefined') updates.selectedOptions = [];
                    if (typeof data.staffName === 'undefined') updates.staffName = null;
                    if (typeof data.customName === 'undefined') updates.customName = null;
                    if (typeof data.receptionNotes === 'undefined') updates.receptionNotes = null;
                    if (typeof data.pauseReasonId === 'undefined') updates.pauseReasonId = null;
                    
                    if (Object.keys(updates).length > 0) {
                        batch.update(docRef, updates);
                        operationsCount++;
                    }
                    delete roomLanesInDb[i];

                } else {
                    // 新規レーン: 作成
                    const newLaneRef = doc(collection(db, LANES_COLLECTION_PATH));
                    batch.set(newLaneRef, {
                        roomId: room.id,
                        roomName: room.name,
                        laneNum: i,
                        status: 'available',
                        receptionStatus: 'available',
                        selectedOptions: [],
                        staffName: null,
                        customName: null,
                        receptionNotes: null,
                        pauseReasonId: null,
                        updatedAt: serverTimestamp()
                    });
                    operationsCount++;
                }
            }
            
            // 1b. 超過分レーン削除
            for (const laneNumToDelete in roomLanesInDb) {
                const docIdToDelete = roomLanesInDb[laneNumToDelete];
                const docRef = doc(db, LANES_COLLECTION_PATH, docIdToDelete);
                batch.delete(docRef);
                operationsCount++;
            }
        }

        // 2. 削除された部屋のレーン削除
        for (const roomIdInDb in existingLanes) {
            if (!configRoomIds.has(roomIdInDb)) {
                const lanesToDelete = existingLanes[roomIdInDb];
                for (const laneNumToDelete in lanesToDelete) {
                    const docIdToDelete = lanesToDelete[laneNumToDelete];
                    const docRef = doc(db, LANES_COLLECTION_PATH, docIdToDelete);
                    batch.delete(docRef);
                    operationsCount++;
                }
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
            console.log(`Database sync completed. ${operationsCount} operations performed.`);
        } else {
            console.log("Database structure is up-to-date.");
        }

        // 4. 部屋の待機状態 (roomState) ドキュメントを同期
        const roomStateCollectionRef = collection(db, ROOM_STATE_COLLECTION_PATH);
        const currentRoomStateSnapshot = await getDocs(roomStateCollectionRef);
        const existingRoomStateIds = new Set(currentRoomStateSnapshot.docs.map(d => d.id));
        
        const roomStateBatch = writeBatch(db);
        let roomStateOps = 0;

        for (const room of config.rooms) {
            if (!existingRoomStateIds.has(room.id)) {
                const newRoomStateRef = doc(db, ROOM_STATE_COLLECTION_PATH, room.id);
                roomStateBatch.set(newRoomStateRef, {
                    waitingGroups: 0,
                    updatedAt: serverTimestamp()
                });
                roomStateOps++;
            }
        }

        currentRoomStateSnapshot.forEach(doc => {
            if (!configRoomIds.has(doc.id)) {
                roomStateBatch.delete(doc.ref);
                roomStateOps++;
            }
        });

        if (roomStateOps > 0) {
            await roomStateBatch.commit();
            console.log(`RoomState sync completed. ${roomStateOps} operations performed.`);
        }
    } catch (error) {
        console.error("Error during database migration:", error);
    } finally {
        isDbMigrating = false;
        console.log("Database migration lock RELEASED.");
    }
}

/**
 * Firestoreの 'config' ドキュメントを監視
 */
function listenToConfigChanges() {
    const configRef = doc(db, CONFIG_PATH);

    if (unsubscribeConfig) unsubscribeConfig();

    unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
        if (docSnap.exists()) {
            console.log("Config loaded from Firestore.");
            const firestoreData = docSnap.data();

            dynamicAppConfig = {
                ...APP_CONFIG,
                ...firestoreData,
            };

            if (!firestoreData.laneStatuses) {
                dynamicAppConfig.laneStatuses = APP_CONFIG.laneStatuses;
            }
            if (!firestoreData.pauseReasons) {
                dynamicAppConfig.pauseReasons = APP_CONFIG.pauseReasons;
            }
            
            if (firestoreStatus.textContent.includes("設定なし")) {
                    firestoreStatus.textContent = "✅ 設定を読み込みました";
            }

        } else {
            console.warn("No config found in Firestore. Using local default settings (READ-ONLY).");
            dynamicAppConfig = { ...APP_CONFIG };
        }
        
        localAdminConfig = JSON.parse(JSON.stringify(dynamicAppConfig));

        updateGlobalHeader(dynamicAppConfig);

        renderAllUI(currentLanesState, currentRoomState); 

    }, (error) => {
        console.error("Config listener error:", error);
        firestoreStatus.textContent = "設定ファイルの読み込みに失敗しました。";
    });
}

/**
 * Firestoreの 'roomState' コレクションを監視
 */
function listenToRoomStateChanges() {
    const q = query(collection(db, ROOM_STATE_COLLECTION_PATH));
    if (unsubscribeRoomState) unsubscribeRoomState();

    unsubscribeRoomState = onSnapshot(q, (querySnapshot) => {
        console.log("Room state data updated...");
        currentRoomState = {};
        querySnapshot.forEach((doc) => {
            currentRoomState[doc.id] = doc.data();
        });
        
        renderAllUI(currentLanesState, currentRoomState); 
        
    }, (error) => {
        console.error("Room state listener error:", error);
        firestoreStatus.textContent = "部屋待機情報の取得に失敗しました。";
    });
}

/**
 * Firestoreの 'lanes' コレクションを監視
 */
function listenToLaneChanges() {
    const q = query(collection(db, LANES_COLLECTION_PATH));

    if (unsubscribeLanes) unsubscribeLanes();

    unsubscribeLanes = onSnapshot(q, (querySnapshot) => {
        console.log("Lane data updated...");
        currentLanesState = {};
        querySnapshot.forEach((doc) => {
            currentLanesState[doc.id] = doc.data();
        });
        
        renderAllUI(currentLanesState, currentRoomState);
        
    }, (error) => {
        console.error("Lanes listener error:", error);
        firestoreStatus.textContent = "レーン情報の取得に失敗しました。";
    });
}

// --- UI描画 (Render) ---

function renderAllUI(lanesState, roomState) {
    renderReceptionList(lanesState, roomState, dynamicAppConfig);
    renderStaffRoomSelect(dynamicAppConfig); 
    renderStaffLaneDashboard(staffRoomSelect.value, lanesState, roomState, dynamicAppConfig);
    renderAdminSettings(localAdminConfig); 
    renderAdminLaneNames(currentLanesState, dynamicAppConfig); 
    
    // ★追加: サマリーバーの描画
    renderRoomSummaryBar(lanesState, roomState, dynamicAppConfig);
}

/**
 * ★新規追加: 全部屋の簡易状況を表示するサマリーバー
 * (待機がある部屋は赤、空きがある部屋は緑、満室はグレーで表示)
 */
function renderRoomSummaryBar(lanesState, roomState, config) {
    const summaryBar = document.getElementById('room-summary-bar');
    if (!summaryBar) return;
    
    summaryBar.innerHTML = '';

    // データを整形
    const allLanes = Object.values(lanesState);

    config.rooms.forEach(room => {
        // 1. 待機組数を取得
        const rState = roomState[room.id] || { waitingGroups: 0 };
        const waiting = rState.waitingGroups || 0;

        // 2. 空きレーンがあるかチェック (statusが 'available' のもの)
        const roomLanes = allLanes.filter(l => l.roomId === room.id);
        const availableCount = roomLanes.filter(l => l.status === 'available').length;
        
        // 3. 状態判定とスタイル決定
        let statusClass = '';
        let iconHtml = '';
        let textHtml = '';

        if (waiting > 0) {
            // 待機あり (赤色・点滅) -> 最優先
            statusClass = 'bg-red-500 text-white border-red-600 animate-pulse shadow-md';
            iconHtml = '<i class="fa-solid fa-users mr-1"></i>';
            textHtml = `待機: ${waiting}組`;
        } else if (availableCount > 0) {
            // 待機なし & 空きあり (緑色) -> 案内チャンス
            statusClass = 'bg-emerald-500 text-white border-emerald-600 shadow-sm';
            iconHtml = '<i class="fa-regular fa-circle-check mr-1"></i>';
            textHtml = `空き: ${availableCount}`;
        } else {
            // 待機なし & 空きなし (満室・グレー)
            statusClass = 'bg-gray-100 text-gray-500 border-gray-300';
            iconHtml = '<i class="fa-solid fa-ban mr-1"></i>';
            textHtml = '満室';
        }

        // 4. チップを作成
        const chip = document.createElement('div');
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
            const receptionBtn = document.querySelector('button[data-tab="reception"]');
            if (receptionBtn && !receptionBtn.classList.contains('active')) {
                receptionBtn.click();
            }
            
            // 少し遅らせてスクロール (タブ切り替え描画待ち)
            setTimeout(() => {
                // ダッシュボード内のカードを探す (簡易的な実装として、roomNameを含む要素を探す)
                const cards = document.querySelectorAll('.room-dashboard-card h3');
                for (const h3 of cards) {
                    if (h3.textContent === room.name) {
                        h3.closest('.room-dashboard-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // ハイライト演出
                        const card = h3.closest('.room-dashboard-card');
                        card.classList.add('ring-4', 'ring-indigo-400');
                        setTimeout(() => card.classList.remove('ring-4', 'ring-indigo-400'), 1000);
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
function updateGlobalHeader(config) {
    if (globalEventDisplay && globalEventNameText) {
        // 名前を表示
        globalEventNameText.textContent = config.eventName || "名称未設定";
        
        // AppIdも薄く表示
        if (globalAppIdText) {
            globalAppIdText.textContent = `ID: ${currentAppId}`;
        }

        // 表示・非表示の制御 (データ読み込み後に表示)
        globalEventDisplay.classList.remove('hidden');
        
        // ブラウザのタブタイトルも更新
        document.title = `${config.eventName} - LINEΩ`;
    }
}

/**
 * 受付用ビュー (ダッシュボードUI - 濃い色・詳細表示版)
 */
function renderReceptionList(lanesState, roomState, config) {
    receptionList.innerHTML = ''; 
    receptionList.className = "dashboard-grid";
    
    if (config.rooms.length === 0) {
        receptionList.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500 bg-white rounded-lg shadow">部屋設定がありません。「管理設定」で部屋を登録してください。</div>';
        return;
    }

    const allLanes = Object.keys(lanesState).map(docId => ({
        docId: docId,
        data: lanesState[docId]
    }));

    config.rooms.forEach(room => {
        // 部屋カード
        const roomEl = document.createElement('div');
        roomEl.className = 'room-dashboard-card';
        
        // --- ヘッダー (待機数表示) ---
        const state = roomState[room.id] || { waitingGroups: 0 };
        const waitingGroups = state.waitingGroups || 0;
        const headerEl = document.createElement('div');
        headerEl.className = 'bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center';
        const waitBadgeClass = waitingGroups > 0 ? 'wait-exists' : 'wait-zero';
        
        headerEl.innerHTML = `
            <div>
                <h3 class="text-xl font-bold text-gray-800">${room.name}</h3>
                <p class="text-xs text-gray-500 mt-1">全 ${room.lanes} レーン</p>
            </div>
            <div class="flex flex-col items-center">
                <span class="text-xs font-bold text-gray-400 mb-1">待機</span>
                <div class="${waitBadgeClass} wait-badge-large text-gray-800">
                    ${waitingGroups > 0 ? waitingGroups + '組' : '0'}
                </div>
            </div>
        `;
        roomEl.appendChild(headerEl);

        // --- レーン一覧 (タイル) ---
        const lanesContainer = document.createElement('div');
        lanesContainer.className = 'p-4 grid grid-cols-3 gap-3 min-h-[50vh]';
        const roomLanes = allLanes
            .filter(lane => lane.data.roomId === room.id)
            .sort((a, b) => a.data.laneNum - b.data.laneNum);

        if (roomLanes.length === 0) {
            lanesContainer.innerHTML = `<p class="col-span-full text-center text-xs text-gray-400 py-4">レーン未設定</p>`;
        }

        roomLanes.forEach(lane => {
            const docId = lane.docId;
            const laneData = lane.data;
            const laneName = laneData.customName || `${laneData.laneNum}`;

            // ステータス判定
            let tileClass = '';
            let statusIcon = '';
            let statusText = '';
            let isClickable = false;
            let additionalInfo = ''; // 休止理由などを入れる

            // 優先度: 案内中 > その他物理ステータス
            if (laneData.receptionStatus === 'guiding') {
                tileClass = 'tile-guiding';
                statusIcon = '<i class="fa-solid fa-person-walking-arrow-right fa-beat-fade"></i>';
                statusText = '案内中';
            } else {
                switch (laneData.status) {
                    case 'available':
                        tileClass = 'tile-available';
                        statusIcon = '<i class="fa-regular fa-circle-check text-2xl mb-1"></i>';
                        statusText = '空き';
                        isClickable = true; 
                        break;
                    case 'occupied':
                        tileClass = 'tile-occupied';
                        statusIcon = '<i class="fa-solid fa-gamepad"></i>';
                        statusText = '使用中';
                        break;
                    case 'preparing':
                        tileClass = 'tile-preparing';
                        statusIcon = '<i class="fa-solid fa-wrench"></i>';
                        statusText = '準備中';
                        break;
                    case 'paused':
                        tileClass = 'tile-paused';
                        statusIcon = '<i class="fa-solid fa-ban"></i>';
                        statusText = '休止中';
                        // ★追加: 休止理由の表示
                        if (laneData.pauseReasonId) {
                            const reason = config.pauseReasons.find(r => r.id === laneData.pauseReasonId);
                            if (reason) {
                                additionalInfo = `<span class="text-[10px] bg-black/20 px-1 rounded mt-1 truncate max-w-full">${reason.name}</span>`;
                            }
                        }
                        break;
                    default:
                        tileClass = 'bg-gray-400 text-white';
                }
            }

            const laneTile = document.createElement('div');
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
            if (laneData.selectedOptions && laneData.selectedOptions.length > 0) {
                innerContent += `<div class="absolute top-1 right-1 text-[10px] font-bold text-blue-700 bg-white rounded px-1 shadow">Op</div>`;
            }
            if (laneData.receptionNotes) {
                innerContent += `<div class="absolute top-1 left-1 text-[10px] font-bold text-yellow-700 bg-yellow-100 rounded px-1 shadow">Memo</div>`;
            }

            laneTile.innerHTML = innerContent;

            if (isClickable) {
                laneTile.onclick = (e) => {
                    e.stopPropagation();
                    // ★変更: モーダルを開く関数を呼び出す
                    openReceptionLaneModal(docId); 
                };
            }

            lanesContainer.appendChild(laneTile);
        });

        roomEl.appendChild(lanesContainer);
        receptionList.appendChild(roomEl);
    });
}

/**
 * ★新規追加: 受付画面でレーンタイルをクリックした際に表示されるモーダル
 * (レーン担当者画面のmodalと似た構造ですが、受付用は操作に特化させます)
 */
async function openReceptionLaneModal(laneDocId) {
    const laneData = currentLanesState[laneDocId];
    if (!laneData) {
        alert("レーン情報が見つかりません。");
        return;
    }

    const config = dynamicAppConfig; // 最新のconfigを使用

    // モーダルのタイトル設定
    const laneName = laneData.customName || `レーン ${laneData.laneNum}`;
    receptionModalTitle.textContent = `${laneName}へ案内`;

    // モーダルコンテンツを構築
    receptionModalContent.innerHTML = `
        <div class="mb-4">
            <h4 class="text-sm font-bold text-gray-700 mb-2">オプションを選択:</h4>
            <div id="reception-modal-options" class="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
                ${config.options.length > 0 ?
                    config.options.map(opt => `
                        <label class="flex items-center space-x-2 text-sm text-gray-800 mb-1 cursor-pointer">
                            <input type="checkbox" class="reception-opt-chk accent-blue-600" value="${opt.name}"
                                ${laneData.selectedOptions && laneData.selectedOptions.includes(opt.name) ? 'checked' : ''}>
                            <span class="truncate">${opt.name}</span>
                        </label>
                    `).join('') :
                    '<p class="text-xs text-gray-400">オプションは設定されていません。</p>'
                }
            </div>
        </div>

        <div class="mb-6">
            <label for="reception-modal-notes" class="block text-sm font-bold text-gray-700 mb-2">備考 (任意):</label>
            <input type="text" id="reception-modal-notes" 
                   class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" 
                   placeholder="例: 人数、特徴など (任意)"
                   value="${laneData.receptionNotes || ''}">
        </div>

        <button id="reception-modal-start-btn" 
                class="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 transition">
            <i class="fa-solid fa-person-walking-arrow-right mr-2"></i> 案内中にする
        </button>
    `;

    // モーダルを表示
    receptionLaneModal.classList.remove('hidden');

    // イベントリスナー設定
    receptionModalCloseBtn.onclick = () => receptionLaneModal.classList.add('hidden');
    receptionLaneModal.onclick = (e) => { // 背景クリックで閉じる
        if (e.target === receptionLaneModal) {
            receptionLaneModal.classList.add('hidden');
        }
    };

    const startBtn = document.getElementById('reception-modal-start-btn');
    startBtn.onclick = async () => {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 処理中...';

        const selectedOptions = Array.from(document.querySelectorAll('.reception-opt-chk:checked'))
                                     .map(checkbox => checkbox.value);
        const receptionNotes = document.getElementById('reception-modal-notes').value.trim() || null;

        // 案内ステータスを更新
        await updateReceptionStatus(laneDocId, 'guiding', null, selectedOptions, receptionNotes);

        receptionLaneModal.classList.add('hidden'); // モーダルを閉じる
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-person-walking-arrow-right mr-2"></i> 案内中にする';
    };
}

/**
 * レーン担当用ビュー (部屋選択) を描画
 */
function renderStaffRoomSelect(config) {
    const currentSelectedRoom = staffRoomSelect.value;
    
    staffRoomSelect.innerHTML = '<option value="">--- 部屋を選択してください ---</option>';
    config.rooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room.id;
        option.textContent = room.name;
        staffRoomSelect.appendChild(option);
    });
    
    if (currentSelectedRoom) {
        staffRoomSelect.value = currentSelectedRoom;
    }
}

/**
 * レーン担当用ビュー (ダッシュボード) を描画
 */
function renderStaffLaneDashboard(selectedRoomId, lanesState, roomState, config) {
    staffLaneDashboard.innerHTML = ''; 
    
    if (!selectedRoomId) {
        staffLaneDashboard.innerHTML = '<p class="text-center text-gray-500">上記で担当する部屋を選択してください。</p>';
        return;
    }

    const currentState = roomState[selectedRoomId] || { waitingGroups: 0 };
    const currentWaitingGroups = currentState.waitingGroups || 0;
    
    const waitControlEl = document.createElement('div');
    waitControlEl.className = 'bg-white p-4 rounded-lg shadow border border-gray-200 mb-6';
    waitControlEl.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-800 mb-3">待機組数 管理</h3>
        <div class="flex items-center justify-center space-x-4">
            <button data-action="dec-wait" data-roomid="${selectedRoomId}"
                    class="px-5 py-3 bg-red-500 text-white font-bold rounded-lg shadow-md hover:bg-red-600 active:scale-95 transition-transform ${currentWaitingGroups === 0 ? 'opacity-50 cursor-not-allowed' : ''}"
                    ${currentWaitingGroups === 0 ? 'disabled' : ''}>
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
    staffLaneDashboard.appendChild(waitControlEl);

    const allLanes = Object.keys(lanesState).map(docId => ({
        docId: docId,
        data: lanesState[docId]
    }));

    const roomLanes = allLanes
        .filter(lane => lane.data.roomId === selectedRoomId)
        .sort((a, b) => a.data.laneNum - b.data.laneNum);

    if (roomLanes.length === 0) {
        staffLaneDashboard.innerHTML += '<p class="text-center text-gray-500">この部屋にはレーンがありません。</p>';
        return;
    }

    const roomGrid = document.createElement('div');
    roomGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';

    roomLanes.forEach(lane => {
        const docId = lane.docId;
        const laneData = lane.data;

        const laneEl = document.createElement('div');
        laneEl.className = 'lane-card'; 

        const laneDisplayName = laneData.customName || `レーン ${laneData.laneNum}`;
        const staffNameDisplay = laneData.staffName ? `担当: ${laneData.staffName}` : '担当: ---';
        let laneStatusConfig = config.laneStatuses.find(s => s.id === laneData.status) || { name: '不明' };
        let receptionStatusConfig = config.receptionStatuses.find(s => s.id === laneData.receptionStatus) || { name: '不明' };

        let receptionStatusDisplay = receptionStatusConfig.name;
        let receptionStatusClass = "text-gray-500";
        let arrivalButton = '';
        let optionsDisplay = '';
        let notesDisplay = ''; 
        
        if (laneData.status !== 'available' && laneData.receptionStatus === 'available') {
            let statusName = laneStatusConfig.name;
            if (laneData.status === 'paused' && laneData.pauseReasonId) {
                    const reason = config.pauseReasons.find(r => r.id === laneData.pauseReasonId);
                    if (reason) statusName = `休止中 (${reason.name})`;
            }
            receptionStatusDisplay = `(${statusName})`;
        }

        if (laneData.receptionStatus === 'guiding') {
            receptionStatusDisplay = 'お客様 案内中';
            receptionStatusClass = 'text-blue-600 font-bold animate-pulse';
            arrivalButton = `
                <button data-action="confirm-arrival" data-docid="${docId}"
                        class="w-full mt-3 px-3 py-2 text-sm font-medium text-white bg-green-500 rounded-md shadow-sm hover:bg-green-600 active:scale-95 transition-transform">
                    <i class="fa-solid fa-user-check mr-1"></i> お客様 到着確認
                </button>
            `;
        } else if (laneData.receptionStatus === 'available') {
            if (laneData.status === 'available') {
                    receptionStatusDisplay = '案内可';
                    receptionStatusClass = 'text-green-600';
            }
        }
        
        if (laneData.receptionStatus === 'available' && laneData.status === 'occupied' && (laneData.selectedOptions?.length > 0 || laneData.receptionNotes)) {
            if (laneData.selectedOptions?.length > 0) {
                optionsDisplay = `
                    <div class="mt-2 text-xs text-gray-700 font-medium bg-gray-100 p-2 rounded">
                        <i class="fa-solid fa-check-double mr-1 text-blue-600"></i>
                        プラン: ${laneData.selectedOptions.join(', ')}
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
        }
        else if (laneData.receptionStatus === 'guiding' && (laneData.selectedOptions?.length > 0 || laneData.receptionNotes)) {
            if (laneData.selectedOptions?.length > 0) {
                optionsDisplay = `
                    <div class="mt-2 text-xs text-blue-600 font-medium bg-blue-50 p-2 rounded">
                        <i class="fa-solid fa-check-double mr-1"></i>
                        プラン: ${laneData.selectedOptions.join(', ')}
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

        const statusButtons = config.laneStatuses.map(status => {
            const isCurrent = laneData.status === status.id;
            return `
                <button data-action="set-lane-status" data-docid="${docId}" data-status="${status.id}" 
                        class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition ${
                            isCurrent 
                            ? 'text-white shadow ' + status.colorClass 
                            : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
                        }">
                    ${status.icon} ${status.name}
                </button>
            `;
        }).join('');

        const pauseReasonsOptionsHTML = (config.pauseReasons || []).map(reason => 
            `<option value="${reason.id}" ${laneData.pauseReasonId === reason.id ? 'selected' : ''}>${reason.name}</option>`
        ).join('');

        const pauseReasonSelect = `
            <div id="pause-reason-div-${docId}" class="${laneData.status === 'paused' ? 'mt-3' : 'hidden'}">
                <label for="pause-reason-select-${docId}" class="block text-sm font-medium text-gray-700 mb-1">休止理由:</label>
                <select id="pause-reason-select-${docId}" data-action="set-pause-reason" data-docid="${docId}" 
                        class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="">--- 理由を選択 ---</option>
                    ${pauseReasonsOptionsHTML}
                </select>
            </div>
        `;

        laneEl.innerHTML = `
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
                ${pauseReasonSelect} </div>
        `;
        roomGrid.appendChild(laneEl);
    });
    
    staffLaneDashboard.appendChild(roomGrid);
}

/**
 * 管理設定タブを描画 (ローカルの編集用データを使用)
 * ★修正: モバイルでのレイアウト崩れ防止 (min-w-0, ラベル非表示)
 */
function renderAdminSettings(config) {
    // --- イベント基本設定 ---
    if (adminEventNameInput) {
        adminEventNameInput.value = config.eventName || "";
    }

    // --- 部屋リスト ---
    adminRoomList.innerHTML = '';
    if (!config.rooms || config.rooms.length === 0) {
        adminRoomList.innerHTML = '<p class="text-gray-400 text-sm">部屋がありません。</p>';
    }
    
    config.rooms.forEach((room, index) => {
        const isFirst = index === 0;
        const isLast = index === config.rooms.length - 1;

        const roomEl = document.createElement('div');
        roomEl.className = 'flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition';
        
        roomEl.innerHTML = `
            <div class="flex flex-col space-y-1 mr-1 flex-shrink-0">
                <button data-action="move-room-up" data-index="${index}" 
                        class="w-6 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        ${isFirst ? 'disabled' : ''}>
                    <i class="fa-solid fa-chevron-up"></i>
                </button>
                <button data-action="move-room-down" data-index="${index}" 
                        class="w-6 h-5 flex items-center justify-center bg-white border border-gray-300 rounded text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        ${isLast ? 'disabled' : ''}>
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
        adminRoomList.appendChild(roomEl);
    });
    
    // --- オプションリスト ---
    adminOptionsList.innerHTML = '';
    if (!config.options || config.options.length === 0) {
            adminOptionsList.innerHTML = '<p class="text-gray-400 text-sm">オプションがありません。</p>';
    }
    config.options.forEach(option => {
        const optionEl = document.createElement('div');
        optionEl.className = 'flex items-center space-x-2 p-2 bg-gray-50 rounded';
        optionEl.innerHTML = `
            <input type="text" data-action="edit-option-name" data-id="${option.id}" value="${option.name}" class="flex-grow min-w-0 px-2 py-1 border border-gray-300 rounded-md sm:text-sm">
            <button data-action="delete-option" data-id="${option.id}" class="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs flex-shrink-0">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        adminOptionsList.appendChild(optionEl);
    });

    // --- 休止理由リスト ---
    adminPauseReasonsList.innerHTML = '';
    if (!config.pauseReasons || config.pauseReasons.length === 0) {
        adminPauseReasonsList.innerHTML = '<p class="text-gray-400 text-sm">休止理由がありません。</p>';
    }
    config.pauseReasons.forEach(reason => {
        const reasonEl = document.createElement('div');
        reasonEl.className = 'flex items-center space-x-2 p-2 bg-gray-50 rounded';
        reasonEl.innerHTML = `
            <input type="text" data-action="edit-pause-reason-name" data-id="${reason.id}" value="${reason.name}" class="flex-grow min-w-0 px-2 py-1 border border-gray-300 rounded-md sm:text-sm">
            <button data-action="delete-pause-reason" data-id="${reason.id}" class="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-xs flex-shrink-0">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        adminPauseReasonsList.appendChild(reasonEl);
    });
}

/**
 * 管理設定タブ (レーン名カスタム) を描画
 */
function renderAdminLaneNames(lanesState, config) {
    const listEl = document.getElementById('admin-lane-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const allLanes = Object.keys(lanesState).map(docId => ({
        docId: docId,
        data: lanesState[docId]
    }));

    if (allLanes.length === 0) {
        listEl.innerHTML = '<p class="text-gray-400 text-sm">レーンがありません。「管理設定」で部屋を保存してください。</p>';
        return;
    }

    config.rooms.sort((a,b) => a.name.localeCompare(b.name)).forEach(room => {
        const roomLanes = allLanes
            .filter(lane => lane.data.roomId === room.id)
            .sort((a, b) => a.data.laneNum - b.data.laneNum);

        if (roomLanes.length === 0) return;

        const roomGroupEl = document.createElement('div');
        roomGroupEl.className = 'mb-3';
        roomGroupEl.innerHTML = `<h4 class="font-medium text-gray-800 mb-2">${room.name}</h4>`;
        
        const lanesList = document.createElement('div');
        lanesList.className = 'space-y-2 pl-2';

        roomLanes.forEach(lane => {
            const laneEl = document.createElement('div');
            laneEl.className = 'flex items-center space-x-2'; 
            laneEl.innerHTML = `
                <label class="w-20 text-sm text-gray-600">レーン ${lane.data.laneNum}:</label>
                <input type="text" data-action="edit-custom-name" data-docid="${lane.docId}" 
                        value="${lane.data.customName || ''}" 
                        class="flex-grow px-2 py-1 border border-gray-300 rounded-md sm:text-sm" 
                        placeholder="カスタム名 (例: 小学生レーン)">
                <button data-action="save-custom-name" data-docid="${lane.docId}" 
                        class="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-xs font-medium">
                    保存
                </button>
            `;
            lanesList.appendChild(laneEl);
        });
        
        roomGroupEl.appendChild(lanesList);
        listEl.appendChild(roomGroupEl);
    });
}

// --- Firestore 更新 (Write) ---

/**
 * レーン担当者がレーンの物理ステータスを更新
 */
async function updateLaneStatus(docId, newStatus) {
    const staffName = staffNameInput.value.trim() || null; 
    if (!staffName) {
        console.warn("担当者名を入力してください。");
        staffNameInput.focus();
        staffNameInput.classList.add('border-red-500', 'ring-red-500');
        return;
    }
    staffNameInput.classList.remove('border-red-500', 'ring-red-500');

    console.log(`Updating lane ${docId} to ${newStatus} by ${staffName}`);
    const docRef = doc(db, LANES_COLLECTION_PATH, docId);
    
    let updateData = {
        status: newStatus,
        staffName: staffName,
        updatedAt: serverTimestamp()
    };
    
    // 「休止中」以外になったら、休止理由をリセット
    if (newStatus !== 'paused') {
        updateData.pauseReasonId = null;
    }

    // ★修正箇所: 「空き」「準備中」に加えて「休止中」の場合も、客固有のデータ(オプション・備考)をリセットする
    if (newStatus === 'available' || newStatus === 'preparing' || newStatus === 'paused') {
        updateData.selectedOptions = [];
        updateData.receptionNotes = null; 
    }

    try {
        await updateDoc(docRef, updateData);
    } catch (e) {
        console.error("Failed to update lane status:", e);
    }
}

async function updateReceptionStatus(docId, newStatus, staffName = null, options = [], notes = null) {
    console.log(`Updating reception status ${docId} to ${newStatus}`);
    const docRef = doc(db, LANES_COLLECTION_PATH, docId);
    
    let updateData = {
        receptionStatus: newStatus,
        updatedAt: serverTimestamp()
    };

    if (staffName) {
        updateData.staffName = staffName;
    }
    
    if (newStatus === 'guiding') {
            updateData.selectedOptions = options;
            updateData.receptionNotes = notes; 
    }
    
    if (newStatus === 'available' && staffName) { 
        updateData.status = 'occupied'; 
    }

    try {
        await updateDoc(docRef, updateData);
    } catch (e) {
        console.error("Failed to update reception status:", e);
    }
}

async function updateLanePauseReason(docId, reasonId) {
    const staffName = staffNameInput.value.trim() || null; 
    if (!staffName) {
        console.warn("担当者名を入力してください。");
        staffNameInput.focus();
        staffNameInput.classList.add('border-red-500', 'ring-red-500');
        return;
    }
    staffNameInput.classList.remove('border-red-500', 'ring-red-500');

    console.log(`Updating pause reason ${docId} to ${reasonId} by ${staffName}`);
    const docRef = doc(db, LANES_COLLECTION_PATH, docId);
    
    try {
        await updateDoc(docRef, {
            pauseReasonId: reasonId || null, 
            staffName: staffName,
            updatedAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Failed to update pause reason:", e);
    }
}

async function updateLaneCustomName(docId, newName) {
    console.log(`Updating custom name for ${docId} to '${newName}'`);
    const docRef = doc(db, LANES_COLLECTION_PATH, docId);
    try {
        await updateDoc(docRef, {
            customName: newName || null 
        });
        const btn = document.querySelector(`button[data-action='save-custom-name'][data-docid='${docId}']`);
        if(btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅';
            btn.classList.add('bg-green-500', 'hover:bg-green-500');
            btn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('bg-green-500', 'hover:bg-green-500');
                btn.classList.add('bg-blue-500', 'hover:bg-blue-600');
            }, 1500);
        }
    } catch (e) {
        console.error("Failed to update custom name:", e);
    }
}

async function saveAdminSettings() {
    console.log("Saving admin settings to Firestore...");
    
    adminSaveStatus.textContent = "保存中...";
    adminSaveStatus.className = "text-sm text-center mt-3 text-blue-600";
    
    // ★追加: 入力されたイベント名をローカル設定に反映
    if (adminEventNameInput) {
        const newName = adminEventNameInput.value.trim();
        if (newName) {
            localAdminConfig.eventName = newName;
        } else {
            localAdminConfig.eventName = "名称未設定イベント";
        }
    }

    const configRef = doc(db, CONFIG_PATH);
    try {
        await setDoc(configRef, localAdminConfig);
        await updateEventRegistry();

        adminSaveStatus.textContent = "✅ 設定を保存しました。DB同期を開始します...";
        console.log("Config saved. Explicitly starting migration...");
        
        if (!isDbMigrating) {
            isDbMigrating = true; 
            console.log("Migration lock ACQUIRED by saveAdminSettings.");
            
            await checkAndInitDatabase(localAdminConfig); 
            
            adminSaveStatus.textContent = "✅ DB同期が完了しました。";
        } else {
            console.warn("Migration is already in progress. Skipping call.");
            adminSaveStatus.textContent = "✅ 設定を保存しました。(DB同期は他で実行中です)";
        }
        
    } catch (e) {
        console.error("Failed to save settings:", e);
        adminSaveStatus.textContent = "❌ 保存に失敗しました。";
        adminSaveStatus.className = "text-sm text-center mt-3 text-red-500";
    }
    
    setTimeout(() => { adminSaveStatus.textContent = ""; }, 3000);
}

async function updateWaitingGroups(roomId, newCount) {
    if (newCount < 0) {
        newCount = 0; 
    }
    console.log(`Updating waiting groups for room ${roomId} to ${newCount}`);
    
    const docRef = doc(db, ROOM_STATE_COLLECTION_PATH, roomId);
    
    try {
        await setDoc(docRef, { 
            waitingGroups: newCount,
            updatedAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.error("Failed to update waiting groups:", e);
    }
}

// ★新規追加: イベント情報をレジストリに書き込む関数
async function updateEventRegistry() {
    try {
        // 現在のAppIDをドキュメントIDとして保存
        const registryRef = doc(db, REGISTRY_COLLECTION_PATH, currentAppId); // グローバル変数 currentAppId (URLパラメータ由来) を使用
        
        // 部屋名のサマリを作成 (例: "A部屋, B部屋")
        const roomNames = localAdminConfig.rooms.map(r => r.name).join(', ');
        const totalLanes = localAdminConfig.rooms.reduce((sum, r) => sum + r.lanes, 0);

        await setDoc(registryRef, {
            appId: currentAppId,
            roomSummary: roomNames || "部屋なし",
            totalLanes: totalLanes,
            lastUpdated: serverTimestamp()
        }, { merge: true });
        
        console.log("Registry updated for:", currentAppId);
    } catch (e) {
        console.error("Failed to update registry:", e);
    }
}

// --- DB管理画面のロジック ---

let registryCache = []; // 検索用にデータをメモリに保持

/**
 * イベント台帳を取得して一覧表示
 */
async function fetchAndRenderEventList() {
    if (!dbEventList) return;
    dbEventList.innerHTML = '<p class="p-4 text-center text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin"></i> 読み込み中...</p>';

    try {
        const q = query(collection(db, REGISTRY_COLLECTION_PATH));
        const querySnapshot = await getDocs(q);
        
        registryCache = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // 日付オブジェクトへの変換
            const date = data.lastUpdated ? data.lastUpdated.toDate() : new Date();
            registryCache.push({
                ...data,
                dateObj: date,
                dateStr: date.toLocaleString('ja-JP')
            });
        });

        // 日付の新しい順にソート
        registryCache.sort((a, b) => b.dateObj - a.dateObj);

        renderEventList(registryCache);

    } catch (error) {
        console.error("Error fetching registry:", error);
        dbEventList.innerHTML = '<p class="p-4 text-center text-red-500 text-sm">読み込みに失敗しました。</p>';
    }
}

/**
 * 一覧の描画 (検索フィルタ対応)
 */
function renderEventList(dataList) {
    if (dataList.length === 0) {
        dbEventList.innerHTML = '<p class="p-4 text-center text-gray-400 text-sm">イベントが見つかりません。設定を保存するとここに表示されます。</p>';
        return;
    }

    dbEventList.innerHTML = '';
    
    dataList.forEach(item => {
        const isCurrent = (item.appId === currentAppId);
        const row = document.createElement('div');
        row.className = `px-4 py-3 flex items-center border-b border-gray-100 hover:bg-gray-50 transition ${isCurrent ? 'bg-blue-50' : ''}`;
        
        row.innerHTML = `
            <div class="w-1/3 pr-2">
                <div class="font-bold text-gray-800 text-sm truncate" title="${item.appId}">
                    ${item.appId}
                    ${isCurrent ? '<span class="ml-2 px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">現在の選択</span>' : ''}
                </div>
            </div>
            <div class="w-1/3 pr-2">
                <div class="text-xs text-gray-600 truncate" title="${item.roomSummary}">
                    ${item.roomSummary}
                </div>
                <div class="text-xs text-gray-400">
                    計 ${item.totalLanes} レーン
                </div>
            </div>
            <div class="w-1/3 text-right">
                <div class="text-xs text-gray-500 mb-1">${item.dateStr}</div>
                ${!isCurrent ? `
                    <button data-action="switch-app-id" data-id="${item.appId}" class="text-xs px-2 py-1 bg-white border border-blue-500 text-blue-600 rounded hover:bg-blue-50">
                        切替
                    </button>
                ` : '<span class="text-xs text-gray-400">選択中</span>'}
            </div>
        `;
        dbEventList.appendChild(row);
    });
}

// --- イベントリスナー設定 ---

function setupEventListeners() {
    
    tabs.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-tab]');
        if (!button) return;

        if (button.classList.contains('active')) {
            return;
        }

        const tabId = button.dataset.tab;
        
        // ★追加: DB管理タブを開いたとき認証チェック & データ取得
        if (tabId === 'database') {
            if (!checkAuthentication()) {
                e.preventDefault(); return;
            }
            // データを取得して表示
            fetchAndRenderEventList();
        }

        if (tabId === 'reception' || tabId === 'admin') {
            if (!checkAuthentication()) {
                e.preventDefault(); 
                return;
            }
        }

        tabs.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        tabContents.querySelectorAll('.tab-pane').forEach(pane => {
            if (pane.id === `tab-${tabId}`) {
                pane.classList.remove('hidden');
            } else {
                pane.classList.add('hidden');
            }
        });
    });

    // --- DB管理画面: 検索・リフレッシュ ---
    if (dbSearchInput) {
        dbSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = registryCache.filter(item => 
                item.appId.toLowerCase().includes(term) || 
                (item.roomSummary && item.roomSummary.toLowerCase().includes(term))
            );
            renderEventList(filtered);
        });
    }
    if (dbRefreshBtn) {
        dbRefreshBtn.addEventListener('click', fetchAndRenderEventList);
    }
    
    // --- DB管理画面: イベント切替 (イベント移譲) ---
    if (dbEventList) {
        dbEventList.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="switch-app-id"]');
            if (!btn) return;
            
            const targetId = btn.dataset.id;
            if (confirm(`イベントID '${targetId}' に切り替えますか？\n画面がリロードされます。`)) {
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('app_id', targetId);
                window.location.href = newUrl.toString();
            }
        });
    }

// --- DB管理画面: エクスポート (フルバックアップ) ---
    const dbExportBtn = document.getElementById('db-export-btn');
    
    if (dbExportBtn) {
        dbExportBtn.addEventListener('click', async () => {
            // ボタンを一時的に無効化
            const originalText = dbExportBtn.textContent;
            dbExportBtn.disabled = true;
            dbExportBtn.textContent = "データ収集中..."; // 

            try {
                // 1. 設定データ (Config)
                const configData = localAdminConfig;

                // 2. レーンデータ (Lanes) - DBから全件取得
                // カスタム名やステータスはここにあります
                const lanesSnap = await getDocs(collection(db, LANES_COLLECTION_PATH));
                const lanesData = lanesSnap.docs.map(doc => ({
                    _id: doc.id, // ドキュメントIDも保存して復元時に使う
                    ...doc.data()
                }));

                // 3. 部屋状態 (RoomState) - DBから取得
                // 待機組数はここにあります
                const roomStateSnap = await getDocs(collection(db, ROOM_STATE_COLLECTION_PATH));
                const roomStateData = roomStateSnap.docs.map(doc => ({
                    _id: doc.id,
                    ...doc.data()
                }));

                // まとめてオブジェクトにする
                const fullBackupData = {
                    meta: {
                        version: 1,
                        appId: currentAppId,
                        type: 'full_backup',
                        exportedAt: new Date().toISOString()
                    },
                    config: configData,
                    lanes: lanesData,
                    roomState: roomStateData
                };

                // JSON変換とダウンロード処理
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackupData, null, 2));
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                
                // 日時付きファイル名
                const now = new Date();
                const dateStr = now.getFullYear() +
                                String(now.getMonth() + 1).padStart(2, '0') +
                                String(now.getDate()).padStart(2, '0') + "_" +
                                String(now.getHours()).padStart(2, '0') +
                                String(now.getMinutes()).padStart(2, '0');
                                
                downloadAnchorNode.setAttribute("download", `line_omega_FULL_backup_${currentAppId}_${dateStr}.json`);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();

            } catch (e) {
                console.error("Export failed:", e);
                alert("エクスポート中にエラーが発生しました。コンソールを確認してください。");
            } finally {
                dbExportBtn.disabled = false;
                dbExportBtn.textContent = originalText;
            }
        });
    }

    // --- DB管理画面: インポート (フルリストア対応) ---
    if (dbImportFile) {
        dbImportFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    
                    // バックアップ形式の判定 (lanesデータが含まれているか？)
                    const isFullBackup = !!json.lanes && !!json.roomState;
                    
                    // Configの検証
                    const configToCheck = isFullBackup ? json.config : json;
                    if (!configToCheck.rooms || !Array.isArray(configToCheck.rooms)) {
                        alert("無効なファイルです。(roomsデータが見つかりません)");
                        return;
                    }

                    const confirmMsg = isFullBackup 
                        ? "【完全復元】\nこのバックアップには「レーン名」「待機状況」なども含まれています。\n現在のデータを全て削除し、このファイルの状態に完全に戻しますか？"
                        : "【設定のみ復元】\nこれは古い形式の設定ファイルです。\n現在の設定を上書きしますが、レーン名などは復元されません。よろしいですか？";

                    if (confirm(confirmMsg)) {
                        console.log("Starting restore process...");
                        
                        if (isFullBackup) {
                            // === A. 完全復元プロセス ===
                            
                            // 1. 既存データの削除 (Batch処理)
                            const batch = writeBatch(db);
                            
                            // 現在のレーンを全削除
                            const currentLanes = await getDocs(collection(db, LANES_COLLECTION_PATH));
                            currentLanes.forEach(doc => batch.delete(doc.ref));
                            
                            // 現在の部屋状態を全削除
                            const currentRoomStates = await getDocs(collection(db, ROOM_STATE_COLLECTION_PATH));
                            currentRoomStates.forEach(doc => batch.delete(doc.ref));
                            
                            // 2. データの書き戻し
                            
                            // Config
                            localAdminConfig = json.config;
                            const configRef = doc(db, CONFIG_PATH);
                            batch.set(configRef, localAdminConfig);

                            // Lanes (IDを維持して復元)
                            json.lanes.forEach(laneData => {
                                const docId = laneData._id;
                                const { _id, ...data } = laneData; // _idを除外してデータのみにする
                                data.updatedAt = serverTimestamp(); // 更新時刻は現在にする
                                const docRef = doc(db, LANES_COLLECTION_PATH, docId);
                                batch.set(docRef, data);
                            });

                            // RoomState
                            json.roomState.forEach(rsData => {
                                const docId = rsData._id;
                                const { _id, ...data } = rsData;
                                data.updatedAt = serverTimestamp();
                                const docRef = doc(db, ROOM_STATE_COLLECTION_PATH, docId);
                                batch.set(docRef, data);
                            });
                            
                            // レジストリ(イベント一覧)も更新
                            const registryRef = doc(db, REGISTRY_COLLECTION_PATH, currentAppId);
                            batch.set(registryRef, {
                                appId: currentAppId,
                                roomSummary: localAdminConfig.rooms.map(r => r.name).join(', '),
                                totalLanes: localAdminConfig.rooms.reduce((sum, r) => sum + r.lanes, 0),
                                lastUpdated: serverTimestamp()
                            }, { merge: true });

                            await batch.commit();

                        } else {
                            // === B. 旧形式(設定のみ)復元 ===
                            localAdminConfig = json;
                            await saveAdminSettings(); // 既存の関数を使用（マイグレーションが走る）
                        }

                        alert("復元が完了しました！画面をリロードします。");
                        window.location.reload(); 
                    }
                } catch (error) {
                    console.error("Import error:", error);
                    alert("ファイルの読み込みに失敗しました: " + error.message);
                }
                dbImportFile.value = ''; // リセット
            };
            reader.readAsText(file);
        });
    }    

    // --- 8. イベントID管理 (リネーム・複製機能) ---

    const lblCurrentAppId = document.getElementById('lbl-current-appid');
    if (lblCurrentAppId) lblCurrentAppId.textContent = currentAppId;

    const inputNewAppId = document.getElementById('input-new-app-id');
    const btnSwitchOnly = document.getElementById('btn-switch-only');
    const btnCopySwitch = document.getElementById('btn-copy-switch');

    // バリデーション関数
    const validateAppId = (id) => {
        if (!id) return "IDを入力してください";
        if (id === currentAppId) return "現在のIDと同じです";
        // 日本語もFirebase的にはOKですが、URLパラメータでの扱いやすさを考えると英数字推奨
        if (!/^[a-zA-Z0-9_\-]+$/.test(id)) return "IDは半角英数字、ハイフン(-)、アンダースコア(_) のみを推奨します";
        return null;
    };

    // A. 空で移動 (新規作成)
    if (btnSwitchOnly) {
        btnSwitchOnly.addEventListener('click', () => {
            const newId = inputNewAppId.value.trim();
            const error = validateAppId(newId);
            if (error) { alert(error); return; }

            if (confirm(`新しいイベントID '${newId}' に切り替えますか？\n現在のデータはコピーされず、初期状態で始まります。`)) {
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('app_id', newId);
                window.location.href = newUrl.toString();
            }
        });
    }

    // B. コピーして移動 (複製・リネーム)
    if (btnCopySwitch) {
        btnCopySwitch.addEventListener('click', async () => {
            const newId = inputNewAppId.value.trim();
            const error = validateAppId(newId);
            if (error) { alert(error); return; }

            if (!confirm(`現在のデータを '${newId}' に複製して移動しますか？\n(実質的なリネーム操作です)`)) return;

            btnCopySwitch.disabled = true;
            btnCopySwitch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 複製中...';

            try {
                // --- データの読み出し (Copy Source) ---
                
                // 1. Config (メモリ上の最新データを使用)
                const sourceConfig = localAdminConfig;

                // 2. Lanes (DBから取得)
                const sourceLanesSnap = await getDocs(collection(db, LANES_COLLECTION_PATH));
                
                // 3. RoomState (DBから取得)
                const sourceRoomStateSnap = await getDocs(collection(db, ROOM_STATE_COLLECTION_PATH));

                // --- データの書き込み (Copy Target) ---
                // 新しいパスを構築
                const NEW_CONFIG_PATH = `/artifacts/${newId}/public/data/config/appConfig`;
                const NEW_LANES_PATH = `/artifacts/${newId}/public/data/lanes`;
                const NEW_ROOMSTATE_PATH = `/artifacts/${newId}/public/data/roomState`;
                const NEW_REGISTRY_PATH = `sys_registry`;

                const batch = writeBatch(db);
                let opCount = 0;

                // 1. Config書き込み
                batch.set(doc(db, NEW_CONFIG_PATH), sourceConfig);
                opCount++;

                // 2. Lanes書き込み
                sourceLanesSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const newDocRef = doc(db, NEW_LANES_PATH, docSnap.id); // IDを維持
                    batch.set(newDocRef, data);
                    opCount++;
                });

                // 3. RoomState書き込み
                sourceRoomStateSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    const newDocRef = doc(db, NEW_ROOMSTATE_PATH, docSnap.id);
                    batch.set(newDocRef, data);
                    opCount++;
                });
                
                // 4. レジストリ登録 (新しいID用)
                const registryRef = doc(db, NEW_REGISTRY_PATH, newId);
                batch.set(registryRef, {
                    appId: newId,
                    roomSummary: sourceConfig.rooms.map(r => r.name).join(', '),
                    totalLanes: sourceConfig.rooms.reduce((sum, r) => sum + r.lanes, 0),
                    lastUpdated: serverTimestamp()
                });
                opCount++;

                // コミット実行
                console.log(`Cloning ${opCount} documents to ${newId}...`);
                await batch.commit();

                alert(`複製が完了しました！\n新しいID: ${newId} に移動します。`);
                
                // リダイレクト
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('app_id', newId);
                window.location.href = newUrl.toString();

            } catch (e) {
                console.error("Copy failed:", e);
                alert("複製中にエラーが発生しました。\n" + e.message);
                btnCopySwitch.disabled = false;
                btnCopySwitch.innerHTML = '<i class="fa-solid fa-copy"></i> コピーして移動';
            }
        });
    }

    receptionList.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;

        if (action === 'set-guiding') {
            const docId = button.dataset.docid;
            if (!docId) return;
            
            const optionsUITargetId = button.dataset.optionsTarget;
            const optionsUI = optionsUITargetId ? document.getElementById(optionsUITargetId) : null;
            
            const notesUITargetId = button.dataset.notesTarget;
            const notesUI = notesUITargetId ? document.getElementById(notesUITargetId) : null;

            let selectedOptions = []; 
            let notes = null; 

            if (optionsUI) {
                optionsUI.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                    selectedOptions.push(cb.value); 
                });
            }
            
            if (notesUI) {
                const notesInput = notesUI.querySelector('input');
                if (notesInput && notesInput.value.trim() !== '') {
                    notes = notesInput.value.trim();
                }
            }
            
            updateReceptionStatus(docId, 'guiding', null, selectedOptions, notes);
        }
        
        if (action === 'toggle-options') {
            const targetId = button.dataset.target;
            
            if (targetId) {
                const targetUI = document.getElementById(targetId);
                if (targetUI && targetUI.classList) { 
                    targetUI.classList.toggle('hidden');
                    button.textContent = targetUI.classList.contains('hidden') ? '＋ オプション選択' : '－ オプションを閉じる';
                } else {
                    console.error(`Element not found for targetId: ${targetId}`);
                }
            } else {
                    console.error("Button is missing data-target attribute:", button);
            }
        }
    });

    staffRoomSelect.addEventListener('change', (e) => {
        const selectedRoomId = e.target.value;
        renderStaffLaneDashboard(selectedRoomId, currentLanesState, currentRoomState, dynamicAppConfig);
    });

    staffLaneDashboard.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;

        if (action === 'set-lane-status' || action === 'confirm-arrival') {
            const docId = button.dataset.docid;
            if (!docId) return; 
            
            if (action === 'set-lane-status') {
                const status = button.dataset.status;
                if (status) {
                    updateLaneStatus(docId, status);
                }
            }
            
            if (action === 'confirm-arrival') {
                const staffName = staffNameInput.value.trim() || null;
                if (!staffName) {
                    console.warn("担当者名を入力してください。");
                    staffNameInput.focus();
                    staffNameInput.classList.add('border-red-500', 'ring-red-500');
                    return;
                }
                staffNameInput.classList.remove('border-red-500', 'ring-red-500');
                
                updateReceptionStatus(docId, 'available', staffName, []); 
            }
        }

        const roomId = button.dataset.roomid;
        if (roomId) { 
            
            const currentState = currentRoomState[roomId] || { waitingGroups: 0 };
            const currentWaitingGroups = currentState.waitingGroups || 0;

            if (action === 'inc-wait') {
                updateWaitingGroups(roomId, currentWaitingGroups + 1);
            }
            
            if (action === 'dec-wait') {
                if (currentWaitingGroups > 0) { 
                    updateWaitingGroups(roomId, currentWaitingGroups - 1);
                }
            }
        }
    });

    staffLaneDashboard.addEventListener('change', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'SELECT' || target.dataset.action !== 'set-pause-reason') {
            return;
        }

        const docId = target.dataset.docid;
        const reasonId = target.value;
        
        if (docId) {
            updateLanePauseReason(docId, reasonId);
        }
    });

    // 管理設定 (部屋・オプションのローカル編集)
    
    adminAddRoomBtn.addEventListener('click', () => {
        const newName = adminNewRoomInput.value.trim();
        const newLanes = parseInt(adminNewRoomLanesInput.value, 10) || 1;
        if (!newName) return;
        
        const newId = `room_${Date.now()}`;
        localAdminConfig.rooms.push({ id: newId, name: newName, lanes: newLanes });
        adminNewRoomInput.value = '';
        adminNewRoomLanesInput.value = 1;
        renderAdminSettings(localAdminConfig); 
    });

    adminAddOptionBtn.addEventListener('click', () => {
        const newName = adminNewOptionInput.value.trim();
        if (!newName) return;
        
        const newId = `opt_${Date.now()}`;
        localAdminConfig.options.push({ id: newId, name: newName });
        adminNewOptionInput.value = '';
        renderAdminSettings(localAdminConfig); 
    });
    
    adminAddPauseReasonBtn.addEventListener('click', () => {
        const newName = adminNewPauseReasonInput.value.trim();
        if (!newName) return;
        
        const newId = `reason_${Date.now()}`;
        if (!localAdminConfig.pauseReasons) {
            localAdminConfig.pauseReasons = [];
        }
        localAdminConfig.pauseReasons.push({ id: newId, name: newName });
        adminNewPauseReasonInput.value = '';
        renderAdminSettings(localAdminConfig); 
    });

    // ----------------------------------------------------
    // 管理設定タブ全体のイベントリスナー (イベント移譲)
    // ----------------------------------------------------
    document.getElementById('tab-admin').addEventListener('click', (e) => {
        // アイコンをクリックした場合も考慮して .closest('button') で親ボタンを取得
        const btn = e.target.closest('button');
        const target = e.target; // input系のためこれも残す
        
        // input系の変更検知用
        const actionInput = target.dataset.action; 
        
        // ボタン系の検知用
        const actionBtn = btn ? btn.dataset.action : null;
        
        // ★追加: 部屋の並び替え処理 (上へ)
        if (actionBtn === 'move-room-up') {
            const index = parseInt(btn.dataset.index, 10);
            if (index > 0) {
                // 配列の要素を入れ替え (分割代入を使用)
                const rooms = localAdminConfig.rooms;
                [rooms[index - 1], rooms[index]] = [rooms[index], rooms[index - 1]];
                renderAdminSettings(localAdminConfig); // 再描画
            }
            return;
        }

        // ★追加: 部屋の並び替え処理 (下へ)
        if (actionBtn === 'move-room-down') {
            const index = parseInt(btn.dataset.index, 10);
            const rooms = localAdminConfig.rooms;
            if (index < rooms.length - 1) {
                [rooms[index], rooms[index + 1]] = [rooms[index + 1], rooms[index]];
                renderAdminSettings(localAdminConfig); // 再描画
            }
            return;
        }

        // --- 既存の処理 (削除系) ---
        const id = btn ? btn.dataset.id : null; // 削除ボタン用ID
        
        if (actionBtn === 'delete-room' && id) {
            if(!confirm("この部屋を削除しますか？\n(保存ボタンを押すまで確定しません)")) return;
            localAdminConfig.rooms = localAdminConfig.rooms.filter(r => r.id !== id);
            renderAdminSettings(localAdminConfig);
        }
        if (actionBtn === 'delete-option' && id) {
            localAdminConfig.options = localAdminConfig.options.filter(o => o.id !== id);
            renderAdminSettings(localAdminConfig);
        }
        if (actionBtn === 'delete-pause-reason' && id) {
            localAdminConfig.pauseReasons = localAdminConfig.pauseReasons.filter(r => r.id !== id);
            renderAdminSettings(localAdminConfig);
        }
        
        // --- 既存の処理 (レーン名保存) ---
        if (actionBtn === 'save-custom-name') {
             // ... (既存のコードそのまま) ...
             const docId = btn.dataset.docid; // btnを使うように修正
             if (!docId) return;
             const inputEl = btn.closest('.flex').querySelector('input[data-action="edit-custom-name"]');
             if (inputEl) {
                 const newName = inputEl.value.trim();
                 updateLaneCustomName(docId, newName);
             }
        }
    });
    
    document.getElementById('tab-admin').addEventListener('change', (e) => {
            const target = e.target;
            const action = target.dataset.action;
            const id = target.dataset.id;
            
            if (!action || !id) return;
            
            if (action === 'edit-room-name') {
                const room = localAdminConfig.rooms.find(r => r.id === id);
                if(room) room.name = target.value;
            }
            if (action === 'edit-room-lanes') {
                const room = localAdminConfig.rooms.find(r => r.id === id);
                if(room) room.lanes = parseInt(target.value, 10) || 1;
            }
            if (action === 'edit-option-name') {
                const option = localAdminConfig.options.find(o => o.id === id);
                if(option) option.name = target.value;
            }
            if (action === 'edit-pause-reason-name') {
                const reason = localAdminConfig.pauseReasons.find(r => r.id === id);
                if(reason) reason.name = target.value;
            }
    });

    // 6. 管理設定 (保存ボタン)
    adminSaveSettingsBtn.addEventListener('click', saveAdminSettings);
}

// --- アプリケーションの開始 ---
(async () => {
    // initializeFirebase() は firebase-config.js で既に完了しているため削除
    // 代わりに auth オブジェクトがあるか確認してからリスナーを開始
    if (auth) {
        setupAuthListener();
    } else {
        console.error("Auth object not found. Check firebase-config.js");
        firestoreStatus.textContent = "Firebase設定エラー";
    }
})();
