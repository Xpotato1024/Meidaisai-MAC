import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
/**
 * データベースの初期化とマイグレーション
 */
export async function checkAndInitDatabase(context, config) {
    const { db, paths, state } = context;
    try {
        console.log("Checking database structure based on config...");
        const lanesCollectionRef = collection(db, paths.lanesCollectionPath);
        const currentDocsSnapshot = await getDocs(lanesCollectionRef);
        const existingLanes = {};
        currentDocsSnapshot.forEach((laneDoc) => {
            const data = laneDoc.data();
            if (!data.roomId) {
                return;
            }
            if (!existingLanes[data.roomId]) {
                existingLanes[data.roomId] = {};
            }
            existingLanes[data.roomId][data.laneNum] = laneDoc.id;
        });
        const batch = writeBatch(db);
        let operationsCount = 0;
        const configRoomIds = new Set(config.rooms.map((room) => room.id));
        for (const room of config.rooms) {
            const roomLanesInDb = existingLanes[room.id] || {};
            // 1a. レーンを追加・更新
            for (let laneNumber = 1; laneNumber <= room.lanes; laneNumber += 1) {
                if (roomLanesInDb[laneNumber]) {
                    // 既存レーン: 更新
                    const docId = roomLanesInDb[laneNumber];
                    const docRef = doc(db, paths.lanesCollectionPath, docId);
                    const docSnap = await getDoc(docRef);
                    if (!docSnap.exists()) {
                        delete roomLanesInDb[laneNumber];
                        continue;
                    }
                    const data = docSnap.data();
                    const updates = {};
                    if (data.roomName !== room.name) {
                        updates.roomName = room.name;
                    }
                    // マイグレーション
                    if (typeof data.receptionStatus === "undefined")
                        updates.receptionStatus = "available";
                    if (typeof data.selectedOptions === "undefined")
                        updates.selectedOptions = [];
                    if (typeof data.staffName === "undefined")
                        updates.staffName = null;
                    if (typeof data.customName === "undefined")
                        updates.customName = null;
                    if (typeof data.receptionNotes === "undefined")
                        updates.receptionNotes = null;
                    if (typeof data.pauseReasonId === "undefined")
                        updates.pauseReasonId = null;
                    if (Object.keys(updates).length > 0) {
                        batch.update(docRef, updates);
                        operationsCount += 1;
                    }
                    delete roomLanesInDb[laneNumber];
                }
                else {
                    // 新規レーン: 作成
                    const newLaneRef = doc(collection(db, paths.lanesCollectionPath));
                    batch.set(newLaneRef, {
                        roomId: room.id,
                        roomName: room.name,
                        laneNum: laneNumber,
                        status: "available",
                        receptionStatus: "available",
                        selectedOptions: [],
                        staffName: null,
                        customName: null,
                        receptionNotes: null,
                        pauseReasonId: null,
                        updatedAt: serverTimestamp()
                    });
                    operationsCount += 1;
                }
            }
            // 1b. 超過分レーン削除
            for (const laneNumToDelete in roomLanesInDb) {
                const docIdToDelete = roomLanesInDb[Number(laneNumToDelete)];
                const docRef = doc(db, paths.lanesCollectionPath, docIdToDelete);
                batch.delete(docRef);
                operationsCount += 1;
            }
        }
        // 2. 削除された部屋のレーン削除
        for (const roomIdInDb in existingLanes) {
            if (!configRoomIds.has(roomIdInDb)) {
                const lanesToDelete = existingLanes[roomIdInDb];
                for (const laneNumToDelete in lanesToDelete) {
                    const docIdToDelete = lanesToDelete[Number(laneNumToDelete)];
                    const docRef = doc(db, paths.lanesCollectionPath, docIdToDelete);
                    batch.delete(docRef);
                    operationsCount += 1;
                }
            }
        }
        if (operationsCount > 0) {
            await batch.commit();
            console.log(`Database sync completed. ${operationsCount} operations performed.`);
        }
        else {
            console.log("Database structure is up-to-date.");
        }
        // 4. 部屋の待機状態 (roomState) ドキュメントを同期
        const roomStateCollectionRef = collection(db, paths.roomStateCollectionPath);
        const currentRoomStateSnapshot = await getDocs(roomStateCollectionRef);
        const existingRoomStateIds = new Set(currentRoomStateSnapshot.docs.map((roomStateDoc) => roomStateDoc.id));
        const roomStateBatch = writeBatch(db);
        let roomStateOps = 0;
        for (const room of config.rooms) {
            if (!existingRoomStateIds.has(room.id)) {
                const newRoomStateRef = doc(db, paths.roomStateCollectionPath, room.id);
                roomStateBatch.set(newRoomStateRef, {
                    waitingGroups: 0,
                    updatedAt: serverTimestamp()
                });
                roomStateOps += 1;
            }
        }
        currentRoomStateSnapshot.forEach((roomStateDoc) => {
            if (!configRoomIds.has(roomStateDoc.id)) {
                roomStateBatch.delete(roomStateDoc.ref);
                roomStateOps += 1;
            }
        });
        if (roomStateOps > 0) {
            await roomStateBatch.commit();
            console.log(`RoomState sync completed. ${roomStateOps} operations performed.`);
        }
    }
    catch (error) {
        console.error("Error during database migration:", error);
    }
    finally {
        state.isDbMigrating = false;
        console.log("Database migration lock RELEASED.");
    }
}
