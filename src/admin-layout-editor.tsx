import { useEffect, useMemo, useState, startTransition, type CSSProperties, type DragEvent } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    createDefaultReceptionLayout,
    formatReceptionWidthRatio,
    getReceptionCardGridSpan,
    getReceptionWidthOptions,
    normalizeReceptionLayoutConfig
} from "./reception-layout.js";
import type { ReceptionLayoutConfig, ReceptionRoomLayout, RoomConfig } from "./types.js";

interface ReceptionLayoutEditorProps {
    rooms: RoomConfig[];
    layout: ReceptionLayoutConfig | undefined;
    onChange: (nextLayout: ReceptionLayoutConfig) => void;
}

interface ReceptionLayoutEditorMountOptions extends ReceptionLayoutEditorProps {
    container: HTMLElement;
}

type DropPlacement = "before" | "after";

interface DropIndicator {
    roomId: string;
    placement: DropPlacement;
}

let editorRoot: Root | null = null;
let editorContainer: HTMLElement | null = null;

function sortLayoutRooms(layout: ReceptionLayoutConfig): ReceptionRoomLayout[] {
    return [...layout.rooms].sort((left, right) => left.order - right.order);
}

function reindexLayoutRooms(items: ReceptionRoomLayout[]): ReceptionRoomLayout[] {
    return items.map((item, index) => ({
        ...item,
        order: index
    }));
}

function updateLayoutRoom(
    currentLayout: ReceptionLayoutConfig,
    roomId: string,
    updater: (item: ReceptionRoomLayout) => ReceptionRoomLayout
): ReceptionLayoutConfig {
    return {
        ...currentLayout,
        rooms: reindexLayoutRooms(
            sortLayoutRooms(currentLayout).map((item) => item.roomId === roomId ? updater(item) : item)
        )
    };
}

function moveLayoutRoom(
    currentLayout: ReceptionLayoutConfig,
    draggedRoomId: string,
    targetRoomId: string,
    placement: DropPlacement
): ReceptionLayoutConfig {
    const orderedRooms = sortLayoutRooms(currentLayout);
    const draggedIndex = orderedRooms.findIndex((item) => item.roomId === draggedRoomId);
    const targetIndex = orderedRooms.findIndex((item) => item.roomId === targetRoomId);

    if (draggedIndex < 0 || targetIndex < 0 || draggedRoomId === targetRoomId) {
        return currentLayout;
    }

    const nextRooms = [...orderedRooms];
    const [draggedRoom] = nextRooms.splice(draggedIndex, 1);
    const targetInsertIndex = nextRooms.findIndex((item) => item.roomId === targetRoomId);
    const insertionIndex = placement === "after" ? targetInsertIndex + 1 : targetInsertIndex;

    nextRooms.splice(insertionIndex, 0, draggedRoom);

    return {
        ...currentLayout,
        rooms: reindexLayoutRooms(nextRooms)
    };
}

function moveLayoutRoomToEnd(
    currentLayout: ReceptionLayoutConfig,
    draggedRoomId: string
): ReceptionLayoutConfig {
    const orderedRooms = sortLayoutRooms(currentLayout);
    const draggedIndex = orderedRooms.findIndex((item) => item.roomId === draggedRoomId);

    if (draggedIndex < 0 || draggedIndex === orderedRooms.length - 1) {
        return currentLayout;
    }

    const nextRooms = [...orderedRooms];
    const [draggedRoom] = nextRooms.splice(draggedIndex, 1);
    nextRooms.push(draggedRoom);

    return {
        ...currentLayout,
        rooms: reindexLayoutRooms(nextRooms)
    };
}

function ReceptionLayoutEditor({ rooms, layout, onChange }: ReceptionLayoutEditorProps) {
    const normalizedLayout = useMemo(() => normalizeReceptionLayoutConfig(layout, rooms), [layout, rooms]);
    const layoutSignature = useMemo(() => JSON.stringify(normalizedLayout), [normalizedLayout]);
    const [draftLayout, setDraftLayout] = useState<ReceptionLayoutConfig>(normalizedLayout);
    const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
    const widthOptions = useMemo(() => getReceptionWidthOptions(), []);

    useEffect(() => {
        setDraftLayout(normalizedLayout);
    }, [layoutSignature, normalizedLayout]);

    const orderedRooms = useMemo(() => sortLayoutRooms(draftLayout), [draftLayout]);

    const updateDraftLayout = (nextLayout: ReceptionLayoutConfig) => {
        startTransition(() => {
            setDraftLayout(nextLayout);
            onChange(nextLayout);
        });
    };

    const handleTileColumnsChange = (roomId: string, nextTileColumns: number) => {
        const nextLayout = updateLayoutRoom(draftLayout, roomId, (item) => ({
            ...item,
            tileColumns: nextTileColumns
        }));
        updateDraftLayout(nextLayout);
    };

    const handleWidthRatioChange = (roomId: string, nextWidthRatio: number) => {
        const nextLayout = updateLayoutRoom(draftLayout, roomId, (item) => ({
            ...item,
            widthRatio: nextWidthRatio
        }));
        updateDraftLayout(nextLayout);
    };

    const handleReset = () => {
        updateDraftLayout(createDefaultReceptionLayout(rooms));
    };

    const clearDragState = () => {
        setDraggedRoomId(null);
        setDropIndicator(null);
    };

    const handleDragStart = (roomId: string, event: DragEvent<HTMLElement>) => {
        setDraggedRoomId(roomId);
        setDropIndicator(null);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", roomId);
    };

    const handleDragOverCard = (roomId: string, event: DragEvent<HTMLElement>) => {
        if (!draggedRoomId || draggedRoomId === roomId) {
            return;
        }

        event.preventDefault();
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const placement: DropPlacement = (event.clientX - rect.left) < (rect.width / 2) ? "before" : "after";
        setDropIndicator({ roomId, placement });
        event.dataTransfer.dropEffect = "move";
    };

    const handleDropOnCard = (roomId: string, event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const droppedRoomId = event.dataTransfer.getData("text/plain") || draggedRoomId;

        if (!droppedRoomId || droppedRoomId === roomId) {
            clearDragState();
            return;
        }

        const nextLayout = moveLayoutRoom(
            draftLayout,
            droppedRoomId,
            roomId,
            dropIndicator?.roomId === roomId ? dropIndicator.placement : "before"
        );
        updateDraftLayout(nextLayout);
        clearDragState();
    };

    const handleDragOverEnd = (event: DragEvent<HTMLElement>) => {
        if (!draggedRoomId) {
            return;
        }
        event.preventDefault();
        setDropIndicator({ roomId: "__end__", placement: "after" });
        event.dataTransfer.dropEffect = "move";
    };

    const handleDropOnEnd = (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const droppedRoomId = event.dataTransfer.getData("text/plain") || draggedRoomId;

        if (!droppedRoomId) {
            clearDragState();
            return;
        }

        updateDraftLayout(moveLayoutRoomToEnd(draftLayout, droppedRoomId));
        clearDragState();
    };

    if (rooms.length === 0) {
        return (
            <div className="admin-layout-editor-empty">
                部屋を追加すると、ここで受付画面のレイアウトを編集できます。
            </div>
        );
    }

    return (
        <div className="admin-layout-editor">
            <div className="admin-layout-editor-toolbar">
                <div>
                    <p className="admin-layout-editor-kicker">Edit Mode</p>
                    <p className="admin-layout-editor-copy">ドラッグで並び替え、カード幅とレーン列数を調整します。受付画面はこの順序で自動配置されます。</p>
                </div>
                <button type="button" className="admin-layout-editor-reset" onClick={handleReset}>
                    初期配置に戻す
                </button>
            </div>

            <div className="admin-layout-editor-canvas">
                {orderedRooms.map((item) => {
                    const room = rooms.find((candidate) => candidate.id === item.roomId);
                    if (!room) {
                        return null;
                    }

                    const previewColumns = Math.max(1, item.tileColumns);
                    const previewTileCount = room.lanes;
                    const isDragging = draggedRoomId === item.roomId;
                    const dropBefore = dropIndicator?.roomId === item.roomId && dropIndicator.placement === "before";
                    const dropAfter = dropIndicator?.roomId === item.roomId && dropIndicator.placement === "after";
                    const cardStyle = {
                        "--editor-card-span": String(getReceptionCardGridSpan(item.widthRatio)),
                        "--editor-tile-columns": String(previewColumns)
                    } as CSSProperties;

                    return (
                        <div
                            key={item.roomId}
                            className={[
                                "admin-layout-editor-item",
                                isDragging ? "is-dragging" : "",
                                dropBefore ? "is-drop-before" : "",
                                dropAfter ? "is-drop-after" : ""
                            ].filter(Boolean).join(" ")}
                            style={cardStyle}
                            onDragOver={(event) => handleDragOverCard(item.roomId, event)}
                            onDrop={(event) => handleDropOnCard(item.roomId, event)}
                        >
                            <div className="admin-layout-editor-card">
                                <div className="admin-layout-editor-card-header">
                                    <div
                                        className="admin-layout-editor-card-handle"
                                        draggable
                                        onDragStart={(event) => handleDragStart(item.roomId, event)}
                                        onDragEnd={clearDragState}
                                    >
                                        <span className="inline-flex"><i className="fa-solid fa-grip-vertical"></i></span>
                                        <span>移動</span>
                                    </div>
                                    <span className="admin-layout-editor-card-span">幅 {formatReceptionWidthRatio(item.widthRatio)}</span>
                                </div>

                                <div className="admin-layout-editor-card-body">
                                    <div>
                                        <h4 className="admin-layout-editor-room-name">{room.name}</h4>
                                        <p className="admin-layout-editor-room-meta">全 {room.lanes} レーン</p>
                                    </div>

                                    <div className="admin-layout-editor-field-grid">
                                        <label className="admin-layout-editor-field">
                                            <span>カード幅</span>
                                            <select
                                                value={String(item.widthRatio)}
                                                onChange={(event) => handleWidthRatioChange(item.roomId, Number(event.target.value))}
                                            >
                                                {widthOptions.map((option) => (
                                                    <option key={option.label} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="admin-layout-editor-field">
                                            <span>レーン列数</span>
                                            <select
                                                value={item.tileColumns}
                                                onChange={(event) => handleTileColumnsChange(item.roomId, Number(event.target.value))}
                                            >
                                                {Array.from({ length: Math.min(room.lanes, 6) }, (_, index) => index + 1).map((columnCount) => (
                                                    <option key={columnCount} value={columnCount}>
                                                        {columnCount} 列
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>

                                    <div className="admin-layout-editor-preview-grid">
                                        {Array.from({ length: previewTileCount }, (_, index) => (
                                            <div key={`${item.roomId}-${index + 1}`} className="admin-layout-editor-preview-tile">
                                                L{index + 1}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                <div
                    className={[
                        "admin-layout-editor-end-drop",
                        dropIndicator?.roomId === "__end__" ? "is-active" : ""
                    ].filter(Boolean).join(" ")}
                    onDragOver={handleDragOverEnd}
                    onDrop={handleDropOnEnd}
                >
                    末尾へ配置
                </div>
            </div>
        </div>
    );
}

export function renderReceptionLayoutEditor({
    container,
    rooms,
    layout,
    onChange
}: ReceptionLayoutEditorMountOptions): void {
    if (editorContainer !== container) {
        editorRoot?.unmount();
        editorRoot = createRoot(container);
        editorContainer = container;
    }

    editorRoot?.render(
        <ReceptionLayoutEditor
            rooms={rooms}
            layout={layout}
            onChange={onChange}
        />
    );
}
