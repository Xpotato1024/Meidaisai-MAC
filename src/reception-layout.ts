import type { ReceptionLayoutConfig, ReceptionRoomLayout, RoomConfig } from "./types.js";

export const RECEPTION_LAYOUT_PACK_COLUMNS = 24;
export const RECEPTION_LAYOUT_WIDTH_PRESETS = [1, 2 / 3, 1 / 2, 1 / 3, 1 / 4] as const;
export const RECEPTION_LAYOUT_EDITOR_GAP_PX = 12;
export const RECEPTION_LAYOUT_DISPLAY_GAP_PX = 16;
const RECEPTION_LAYOUT_MAX_TILE_COLUMNS = 6;

interface WidthPresetOption {
    value: number;
    label: string;
}

export interface PackedReceptionRoomPlacement {
    roomId: string;
    xUnits: number;
    yPx: number;
    widthUnits: number;
    heightPx: number;
}

const RECEPTION_LAYOUT_WIDTH_OPTIONS: WidthPresetOption[] = [
    { value: 1, label: "100%" },
    { value: 2 / 3, label: "66%" },
    { value: 1 / 2, label: "50%" },
    { value: 1 / 3, label: "33%" },
    { value: 1 / 4, label: "25%" }
];

function clampInteger(value: number, minValue: number, maxValue: number): number {
    return Math.min(maxValue, Math.max(minValue, Math.round(value)));
}

function clampWidthRatio(value: number): number {
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

export function getReceptionWidthOptions(): WidthPresetOption[] {
    return [...RECEPTION_LAYOUT_WIDTH_OPTIONS];
}

export function formatReceptionWidthRatio(widthRatio: number): string {
    const preset = clampWidthRatio(widthRatio);
    return RECEPTION_LAYOUT_WIDTH_OPTIONS.find((option) => option.value === preset)?.label || `${Math.round(preset * 100)}%`;
}

export function getDefaultReceptionWidthRatio(totalLanes: number): number {
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

export function getDefaultReceptionTileColumns(totalLanes: number): number {
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

export function getReceptionCardGridSpan(widthRatio: number): number {
    return clampInteger(
        Math.round(clampWidthRatio(widthRatio) * RECEPTION_LAYOUT_PACK_COLUMNS),
        Math.round(RECEPTION_LAYOUT_PACK_COLUMNS / 4),
        RECEPTION_LAYOUT_PACK_COLUMNS
    );
}

function getReceptionTileRows(totalLanes: number, tileColumns: number): number {
    return Math.max(1, Math.ceil(totalLanes / Math.max(tileColumns, 1)));
}

export function getReceptionEditorCardHeightPx(totalLanes: number, tileColumns: number): number {
    const tileRows = getReceptionTileRows(totalLanes, tileColumns);
    return 160 + (tileRows * 34);
}

export function getReceptionDisplayCardHeightPx(totalLanes: number, tileColumns: number): number {
    const tileRows = getReceptionTileRows(totalLanes, tileColumns);
    return 210 + (tileRows * 78);
}

export function createDefaultReceptionLayout(rooms: RoomConfig[]): ReceptionLayoutConfig {
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

export function normalizeReceptionLayoutConfig(
    rawLayout: ReceptionLayoutConfig | undefined,
    rooms: RoomConfig[]
): ReceptionLayoutConfig {
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
        const widthRatio = clampWidthRatio(
            Number.isFinite(rawWidthRatio)
                ? rawWidthRatio
                : legacyWidthRatio ?? fallbackRoom?.widthRatio ?? getDefaultReceptionWidthRatio(room.lanes)
        );

        return {
            roomId: room.id,
            orderSource: Number.isFinite(rawOrder) ? rawOrder : legacyOrder || fallbackOrder,
            fallbackOrder,
            widthRatio,
            tileColumns: clampInteger(
                Number(rawRoom?.tileColumns ?? fallbackRoom?.tileColumns ?? getDefaultReceptionTileColumns(room.lanes)),
                1,
                Math.min(RECEPTION_LAYOUT_MAX_TILE_COLUMNS, Math.max(room.lanes, 1))
            )
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

export function getReceptionRoomLayout(
    layout: ReceptionLayoutConfig | undefined,
    rooms: RoomConfig[],
    roomId: string
): ReceptionRoomLayout {
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

export function sortRoomsByReceptionLayout(
    rooms: RoomConfig[],
    layout: ReceptionLayoutConfig | undefined
): RoomConfig[] {
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

export function packReceptionRoomLayout(
    rooms: RoomConfig[],
    layout: ReceptionLayoutConfig | undefined,
    gapPx: number,
    getHeightPx: (totalLanes: number, tileColumns: number) => number
): {
    placements: PackedReceptionRoomPlacement[];
    canvasHeightPx: number;
} {
    const orderedRooms = sortRoomsByReceptionLayout(rooms, layout);
    const skyline = Array.from({ length: RECEPTION_LAYOUT_PACK_COLUMNS }, () => 0);
    const placements: PackedReceptionRoomPlacement[] = [];

    orderedRooms.forEach((room) => {
        const roomLayout = getReceptionRoomLayout(layout, rooms, room.id);
        const widthUnits = getReceptionCardGridSpan(roomLayout.widthRatio);
        const heightPx = getHeightPx(room.lanes, roomLayout.tileColumns);
        let bestXUnits = 0;
        let bestYPx = Number.POSITIVE_INFINITY;

        for (let startXUnits = 0; startXUnits <= RECEPTION_LAYOUT_PACK_COLUMNS - widthUnits; startXUnits += 1) {
            const candidateYPx = Math.max(...skyline.slice(startXUnits, startXUnits + widthUnits));

            if (candidateYPx < bestYPx) {
                bestYPx = candidateYPx;
                bestXUnits = startXUnits;
            }
        }

        const nextBottom = bestYPx + heightPx + gapPx;
        for (let unit = bestXUnits; unit < bestXUnits + widthUnits; unit += 1) {
            skyline[unit] = nextBottom;
        }

        placements.push({
            roomId: room.id,
            xUnits: bestXUnits,
            yPx: bestYPx,
            widthUnits,
            heightPx
        });
    });

    return {
        placements,
        canvasHeightPx: Math.max(0, Math.max(...skyline) - gapPx)
    };
}
