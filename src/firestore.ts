import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    query
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { APP_CONFIG } from "./default-config.js";
import { cloneConfig } from "./context.js";
import { renderAllUI, updateGlobalHeader } from "./render.js";
import type { AppContext } from "./types.js";

/**
 * Firestoreの 'config' ドキュメントを監視
 */
export function listenToConfigChanges(context: AppContext): void {
    const { db, dom, paths, state } = context;
    const configRef = doc(db, paths.configPath);

    if (state.unsubscribeConfig) {
        state.unsubscribeConfig();
    }

    state.unsubscribeConfig = onSnapshot(
        configRef,
        (docSnap: any) => {
            if (docSnap.exists()) {
                console.log("Config loaded from Firestore.");
                const firestoreData = docSnap.data();

                state.dynamicAppConfig = {
                    ...APP_CONFIG,
                    ...firestoreData
                };

                if (!firestoreData.laneStatuses) {
                    state.dynamicAppConfig.laneStatuses = APP_CONFIG.laneStatuses;
                }
                if (!firestoreData.pauseReasons) {
                    state.dynamicAppConfig.pauseReasons = APP_CONFIG.pauseReasons;
                }

                if (dom.firestoreStatus.textContent?.includes("設定なし")) {
                    dom.firestoreStatus.textContent = "✅ 設定を読み込みました";
                }
            } else {
                console.warn("No config found in Firestore. Using local default settings (READ-ONLY).");
                state.dynamicAppConfig = cloneConfig(APP_CONFIG);
            }

            state.localAdminConfig = cloneConfig(state.dynamicAppConfig);

            updateGlobalHeader(context, state.dynamicAppConfig);
            renderAllUI(context);
        },
        (error: unknown) => {
            console.error("Config listener error:", error);
            dom.firestoreStatus.textContent = "設定ファイルの読み込みに失敗しました。";
        }
    );
}

/**
 * Firestoreの 'roomState' コレクションを監視
 */
export function listenToRoomStateChanges(context: AppContext): void {
    const { db, dom, paths, state } = context;
    const snapshotQuery = query(collection(db, paths.roomStateCollectionPath));

    if (state.unsubscribeRoomState) {
        state.unsubscribeRoomState();
    }

    state.unsubscribeRoomState = onSnapshot(
        snapshotQuery,
        (querySnapshot: any) => {
            console.log("Room state data updated...");
            state.currentRoomState = {};
            querySnapshot.forEach((roomStateDoc: any) => {
                state.currentRoomState[roomStateDoc.id] = roomStateDoc.data();
            });

            renderAllUI(context);
        },
        (error: unknown) => {
            console.error("Room state listener error:", error);
            dom.firestoreStatus.textContent = "部屋待機情報の取得に失敗しました。";
        }
    );
}

/**
 * Firestoreの 'lanes' コレクションを監視
 */
export function listenToLaneChanges(context: AppContext): void {
    const { db, dom, paths, state } = context;
    const snapshotQuery = query(collection(db, paths.lanesCollectionPath));

    if (state.unsubscribeLanes) {
        state.unsubscribeLanes();
    }

    state.unsubscribeLanes = onSnapshot(
        snapshotQuery,
        (querySnapshot: any) => {
            console.log("Lane data updated...");
            state.currentLanesState = {};
            querySnapshot.forEach((laneDoc: any) => {
                state.currentLanesState[laneDoc.id] = laneDoc.data();
            });

            renderAllUI(context);
        },
        (error: unknown) => {
            console.error("Lanes listener error:", error);
            dom.firestoreStatus.textContent = "レーン情報の取得に失敗しました。";
        }
    );
}

export async function fetchRegistryItems(context: AppContext): Promise<void> {
    const { db, dom, paths, state } = context;
    dom.dbEventList.innerHTML = '<p class="p-4 text-center text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin"></i> 読み込み中...</p>';

    try {
        const snapshotQuery = query(collection(db, paths.registryCollectionPath));
        const querySnapshot = await getDocs(snapshotQuery);

        state.registryCache = [];
        querySnapshot.forEach((registryDoc: any) => {
            const data = registryDoc.data();
            const date = data.lastUpdated ? data.lastUpdated.toDate() : new Date();

            state.registryCache.push({
                ...data,
                dateObj: date,
                dateStr: date.toLocaleString("ja-JP")
            });
        });

        state.registryCache.sort((left, right) => {
            return (right.dateObj?.getTime() || 0) - (left.dateObj?.getTime() || 0);
        });
    } catch (error) {
        console.error("Error fetching registry:", error);
        dom.dbEventList.innerHTML = '<p class="p-4 text-center text-red-500 text-sm">読み込みに失敗しました。</p>';
    }
}
