export const RECEPTION_LAYOUT_PACK_COLUMNS = 24;
export const RECEPTION_LAYOUT_WIDTH_PRESETS = [1, 2 / 3, 1 / 2, 1 / 3, 1 / 4];
const RECEPTION_LAYOUT_MAX_TILE_COLUMNS = 6;
const RECEPTION_LAYOUT_WIDTH_OPTIONS = [
    { value: 1, label: "100%" },
    { value: 2 / 3, label: "66%" },
    { value: 1 / 2, label: "50%" },
    { value: 1 / 3, label: "33%" },
    { value: 1 / 4, label: "25%" }
];
function clampInteger(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, Math.round(value)));
}
function clampWidthRatio(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return RECEPTION_LAYOUT_WIDTH_PRESETS[2];
    }
    return RECEPTION_LAYOUT_WIDTH_PRESETS.reduce((closest, candidate) => {
        const candidateDistance = Math.abs(candidate - numericValue);
        const closestDistance = Math.abs(closest - numericValue);
        return candidateDistance < closestDistance ? candidate : closest;
    }, RECEPTION_LAYOUT_WIDTH_PRESETS[0]);
}
export function getReceptionWidthOptions() {
    return [...RECEPTION_LAYOUT_WIDTH_OPTIONS];
}
export function formatReceptionWidthRatio(widthRatio) {
    const preset = clampWidthRatio(widthRatio);
    return RECEPTION_LAYOUT_WIDTH_OPTIONS.find((option) => option.value === preset)?.label || `${Math.round(preset * 100)}%`;
}
export function getDefaultReceptionWidthRatio(totalLanes) {
    if (totalLanes >= 12) {
        return 1;
    }
    if (totalLanes >= 8) {
        return 2 / 3;
    }
    if (totalLanes >= 5) {
        return 1 / 2;
    }
    if (totalLanes >= 2) {
        return 1 / 3;
    }
    return 1 / 4;
}
export function getDefaultReceptionTileColumns(totalLanes) {
    if (totalLanes >= 12) {
        return 5;
    }
    if (totalLanes >= 8) {
        return 4;
    }
    if (totalLanes >= 4) {
        return 3;
    }
    if (totalLanes >= 2) {
        return 2;
    }
    return 1;
}
export function getReceptionCardGridSpan(widthRatio) {
    return clampInteger(Math.round(clampWidthRatio(widthRatio) * RECEPTION_LAYOUT_PACK_COLUMNS), Math.round(RECEPTION_LAYOUT_PACK_COLUMNS / 4), RECEPTION_LAYOUT_PACK_COLUMNS);
}
export function createDefaultReceptionLayout(rooms) {
    return {
        version: 2,
        rooms: rooms.map((room, index) => ({
            roomId: room.id,
            order: index,
            widthRatio: getDefaultReceptionWidthRatio(room.lanes),
            tileColumns: getDefaultReceptionTileColumns(room.lanes)
        }))
    };
}
export function normalizeReceptionLayoutConfig(rawLayout, rooms) {
    const fallbackLayout = createDefaultReceptionLayout(rooms);
    const fallbackByRoomId = new Map(fallbackLayout.rooms.map((item) => [item.roomId, item]));
    const rawRooms = Array.isArray(rawLayout?.rooms) ? rawLayout.rooms : [];
    const rawByRoomId = new Map(rawRooms.map((item) => [item.roomId, item]));
    const normalizedRooms = rooms.map((room, fallbackIndex) => {
        const fallbackRoom = fallbackByRoomId.get(room.id) || fallbackLayout.rooms[fallbackIndex];
        const rawRoom = rawByRoomId.get(room.id);
        const legacyOrder = ((Number(rawRoom?.y) || 0) * 1000) + (Number(rawRoom?.x) || 0);
        const rawOrder = Number(rawRoom?.order);
        const fallbackOrder = fallbackRoom?.order ?? fallbackIndex;
        const rawWidthRatio = Number(rawRoom?.widthRatio);
        const legacyWidthRatio = Number(rawRoom?.w) > 0 ? Number(rawRoom?.w) / 12 : undefined;
        const widthRatio = clampWidthRatio(Number.isFinite(rawWidthRatio)
            ? rawWidthRatio
            : legacyWidthRatio ?? fallbackRoom?.widthRatio ?? getDefaultReceptionWidthRatio(room.lanes));
        return {
            roomId: room.id,
            orderSource: Number.isFinite(rawOrder) ? rawOrder : legacyOrder || fallbackOrder,
            fallbackOrder,
            widthRatio,
            tileColumns: clampInteger(Number(rawRoom?.tileColumns ?? fallbackRoom?.tileColumns ?? getDefaultReceptionTileColumns(room.lanes)), 1, Math.min(RECEPTION_LAYOUT_MAX_TILE_COLUMNS, Math.max(room.lanes, 1)))
        };
    });
    normalizedRooms.sort((left, right) => {
        if (left.orderSource !== right.orderSource) {
            return left.orderSource - right.orderSource;
        }
        if (left.fallbackOrder !== right.fallbackOrder) {
            return left.fallbackOrder - right.fallbackOrder;
        }
        return left.roomId.localeCompare(right.roomId, "ja");
    });
    return {
        version: 2,
        rooms: normalizedRooms.map((item, index) => ({
            roomId: item.roomId,
            order: index,
            widthRatio: item.widthRatio,
            tileColumns: item.tileColumns
        }))
    };
}
export function getReceptionRoomLayout(layout, rooms, roomId) {
    const normalized = normalizeReceptionLayoutConfig(layout, rooms);
    return normalized.rooms.find((room) => room.roomId === roomId)
        || createDefaultReceptionLayout(rooms).rooms.find((room) => room.roomId === roomId)
        || {
            roomId,
            order: 0,
            widthRatio: 1 / 2,
            tileColumns: 2
        };
}
export function sortRoomsByReceptionLayout(rooms, layout) {
    const normalized = normalizeReceptionLayoutConfig(layout, rooms);
    const layoutByRoomId = new Map(normalized.rooms.map((room) => [room.roomId, room]));
    return [...rooms].sort((left, right) => {
        const leftOrder = layoutByRoomId.get(left.id)?.order ?? 0;
        const rightOrder = layoutByRoomId.get(right.id)?.order ?? 0;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        return left.name.localeCompare(right.name, "ja");
    });
}
