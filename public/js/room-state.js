export function createEmptyRoomState(totalLanes, waitingGroups = 0) {
    return {
        waitingGroups,
        totalLanes,
        availableLanes: 0,
        occupiedLanes: 0,
        preparingLanes: 0,
        pausedLanes: 0,
        guidingLanes: 0
    };
}
export function normalizeRoomStateData(rawData, totalLanes) {
    return {
        waitingGroups: Number(rawData?.waitingGroups || 0),
        totalLanes: Number(rawData?.totalLanes || totalLanes || 0),
        availableLanes: Number(rawData?.availableLanes || 0),
        occupiedLanes: Number(rawData?.occupiedLanes || 0),
        preparingLanes: Number(rawData?.preparingLanes || 0),
        pausedLanes: Number(rawData?.pausedLanes || 0),
        guidingLanes: Number(rawData?.guidingLanes || 0),
        updatedAt: rawData?.updatedAt
    };
}
export function getEffectiveLaneState(lane) {
    if (lane.receptionStatus === "guiding") {
        return "guiding";
    }
    if (lane.status === "available") {
        return "available";
    }
    if (lane.status === "occupied") {
        return "occupied";
    }
    if (lane.status === "preparing") {
        return "preparing";
    }
    return "paused";
}
function adjustBucket(summary, bucket, delta) {
    if (bucket === "available") {
        summary.availableLanes = Math.max(0, Number(summary.availableLanes || 0) + delta);
        return;
    }
    if (bucket === "occupied") {
        summary.occupiedLanes = Math.max(0, Number(summary.occupiedLanes || 0) + delta);
        return;
    }
    if (bucket === "preparing") {
        summary.preparingLanes = Math.max(0, Number(summary.preparingLanes || 0) + delta);
        return;
    }
    if (bucket === "guiding") {
        summary.guidingLanes = Math.max(0, Number(summary.guidingLanes || 0) + delta);
        return;
    }
    summary.pausedLanes = Math.max(0, Number(summary.pausedLanes || 0) + delta);
}
export function summarizeRoomState(lanes, totalLanes, waitingGroups = 0) {
    const summary = createEmptyRoomState(totalLanes, waitingGroups);
    lanes.forEach((lane) => {
        adjustBucket(summary, getEffectiveLaneState(lane), 1);
    });
    summary.totalLanes = totalLanes;
    return summary;
}
export function applyLaneTransitionToRoomState(currentRoomState, previousLane, nextLane, totalLanes) {
    const nextRoomState = normalizeRoomStateData(currentRoomState, totalLanes);
    adjustBucket(nextRoomState, getEffectiveLaneState(previousLane), -1);
    adjustBucket(nextRoomState, getEffectiveLaneState(nextLane), 1);
    nextRoomState.totalLanes = totalLanes;
    return nextRoomState;
}
