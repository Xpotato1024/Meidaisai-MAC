export const RECEPTION_LAYOUT_GRID_COLUMNS = 12;
const RECEPTION_LAYOUT_MIN_CARD_SPAN = 3;
const RECEPTION_LAYOUT_MAX_TILE_COLUMNS = 6;
function clampInteger(value, minValue, maxValue) {
    return Math.min(maxValue, Math.max(minValue, Math.round(value)));
}
export function getDefaultReceptionCardSpan(totalLanes) {
    if (totalLanes >= 12) {
        return 12;
    }
    if (totalLanes >= 8) {
        return 8;
    }
    if (totalLanes >= 5) {
        return 6;
    }
    return 4;
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
export function getReceptionEditorCardHeight(totalLanes, tileColumns) {
    const tileRows = Math.ceil(totalLanes / Math.max(tileColumns, 1));
    return Math.max(5, (tileRows * 2) + 3);
}
export function createDefaultReceptionLayout(rooms) {
    const layoutRooms = [];
    let currentX = 0;
    let currentY = 0;
    let rowHeight = 1;
    rooms.forEach((room) => {
        const w = getDefaultReceptionCardSpan(room.lanes);
        const tileColumns = getDefaultReceptionTileColumns(room.lanes);
        const itemHeight = getReceptionEditorCardHeight(room.lanes, tileColumns);
        if (currentX + w > RECEPTION_LAYOUT_GRID_COLUMNS) {
            currentX = 0;
            currentY += rowHeight;
            rowHeight = 1;
        }
        layoutRooms.push({
            roomId: room.id,
            x: currentX,
            y: currentY,
            w,
            tileColumns
        });
        currentX += w;
        rowHeight = Math.max(rowHeight, itemHeight);
    });
    return {
        version: 1,
        rooms: layoutRooms
    };
}
export function normalizeReceptionLayoutConfig(rawLayout, rooms) {
    const fallbackLayout = createDefaultReceptionLayout(rooms);
    const rawRooms = Array.isArray(rawLayout?.rooms) ? rawLayout.rooms : [];
    const rawByRoomId = new Map(rawRooms.map((item) => [item.roomId, item]));
    return {
        version: 1,
        rooms: fallbackLayout.rooms.map((fallbackRoom) => {
            const sourceRoom = rooms.find((room) => room.id === fallbackRoom.roomId);
            const rawRoom = rawByRoomId.get(fallbackRoom.roomId);
            if (!sourceRoom || !rawRoom) {
                return fallbackRoom;
            }
            return {
                roomId: fallbackRoom.roomId,
                x: clampInteger(Number(rawRoom.x ?? fallbackRoom.x), 0, RECEPTION_LAYOUT_GRID_COLUMNS - 1),
                y: Math.max(0, clampInteger(Number(rawRoom.y ?? fallbackRoom.y), 0, 999)),
                w: clampInteger(Number(rawRoom.w ?? fallbackRoom.w), RECEPTION_LAYOUT_MIN_CARD_SPAN, RECEPTION_LAYOUT_GRID_COLUMNS),
                tileColumns: clampInteger(Number(rawRoom.tileColumns ?? fallbackRoom.tileColumns), 1, Math.min(RECEPTION_LAYOUT_MAX_TILE_COLUMNS, Math.max(sourceRoom.lanes, 1)))
            };
        })
    };
}
export function getReceptionRoomLayout(layout, rooms, roomId) {
    const normalized = normalizeReceptionLayoutConfig(layout, rooms);
    return normalized.rooms.find((room) => room.roomId === roomId)
        || createDefaultReceptionLayout(rooms).rooms.find((room) => room.roomId === roomId)
        || {
            roomId,
            x: 0,
            y: 0,
            w: 4,
            tileColumns: 2
        };
}
export function sortRoomsByReceptionLayout(rooms, layout) {
    const normalized = normalizeReceptionLayoutConfig(layout, rooms);
    const layoutByRoomId = new Map(normalized.rooms.map((room) => [room.roomId, room]));
    return [...rooms].sort((left, right) => {
        const leftLayout = layoutByRoomId.get(left.id);
        const rightLayout = layoutByRoomId.get(right.id);
        const leftY = leftLayout?.y ?? 0;
        const rightY = rightLayout?.y ?? 0;
        if (leftY !== rightY) {
            return leftY - rightY;
        }
        const leftX = leftLayout?.x ?? 0;
        const rightX = rightLayout?.x ?? 0;
        if (leftX !== rightX) {
            return leftX - rightX;
        }
        return left.name.localeCompare(right.name, "ja");
    });
}
