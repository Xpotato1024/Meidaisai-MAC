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
    const normalizedTotalLanes = Number(rawData?.totalLanes || totalLanes || 0);
    const availableLanes = Math.max(0, Number(rawData?.availableLanes || 0));
    const occupiedLanes = Math.max(0, Number(rawData?.occupiedLanes || 0));
    const preparingLanes = Math.max(0, Number(rawData?.preparingLanes || 0));
    const guidingLanes = Math.max(0, Number(rawData?.guidingLanes || 0));
    const inferredPausedLanes = Math.max(0, normalizedTotalLanes - (availableLanes + occupiedLanes + preparingLanes + guidingLanes));
    return {
        waitingGroups: Number(rawData?.waitingGroups || 0),
        totalLanes: normalizedTotalLanes,
        availableLanes,
        occupiedLanes,
        preparingLanes,
        pausedLanes: inferredPausedLanes,
        guidingLanes,
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
