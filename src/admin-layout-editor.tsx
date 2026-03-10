import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { createRoot, type Root } from "react-dom/client";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";

import {
    createDefaultReceptionLayout,
    getDefaultReceptionTileColumns,
    getReceptionEditorCardHeight,
    normalizeReceptionLayoutConfig,
    RECEPTION_LAYOUT_GRID_COLUMNS
} from "./reception-layout.js";
import type { ReceptionLayoutConfig, RoomConfig } from "./types.js";

const WidthAwareGridLayout = WidthProvider(GridLayout);

interface ReceptionLayoutEditorProps {
    rooms: RoomConfig[];
    layout: ReceptionLayoutConfig | undefined;
    onChange: (nextLayout: ReceptionLayoutConfig) => void;
}

interface ReceptionLayoutEditorMountOptions extends ReceptionLayoutEditorProps {
    container: HTMLElement;
}

let editorRoot: Root | null = null;
let editorContainer: HTMLElement | null = null;

function toGridLayout(rooms: RoomConfig[], layout: ReceptionLayoutConfig): Layout[] {
    return layout.rooms.map((item) => {
        const room = rooms.find((candidate) => candidate.id === item.roomId);
        return {
            i: item.roomId,
            x: item.x,
            y: item.y,
            w: item.w,
            h: getReceptionEditorCardHeight(room?.lanes || 1, item.tileColumns),
            minW: 3,
            maxW: RECEPTION_LAYOUT_GRID_COLUMNS,
            minH: 5
        };
    });
}

function mergeLayoutPositions(
    currentLayout: ReceptionLayoutConfig,
    rooms: RoomConfig[],
    nextGridLayout: Layout[]
): ReceptionLayoutConfig {
    const nextGridLayoutById = new Map(nextGridLayout.map((item) => [item.i, item]));
    const normalized = normalizeReceptionLayoutConfig(currentLayout, rooms);

    return {
        ...normalized,
        rooms: normalized.rooms.map((item) => {
            const nextItem = nextGridLayoutById.get(item.roomId);
            if (!nextItem) {
                return item;
            }

            return {
                ...item,
                x: nextItem.x,
                y: nextItem.y,
                w: nextItem.w
            };
        })
    };
}

function getPointerPosition(event: MouseEvent | TouchEvent | undefined): { x: number; y: number } | null {
    if (!event) {
        return null;
    }

    if ("touches" in event && event.touches.length > 0) {
        return {
            x: event.touches[0].clientX,
            y: event.touches[0].clientY
        };
    }

    if ("changedTouches" in event && event.changedTouches.length > 0) {
        return {
            x: event.changedTouches[0].clientX,
            y: event.changedTouches[0].clientY
        };
    }

    if ("clientX" in event && "clientY" in event) {
        return {
            x: event.clientX,
            y: event.clientY
        };
    }

    return null;
}

function ReceptionLayoutEditor({ rooms, layout, onChange }: ReceptionLayoutEditorProps) {
    const normalizedLayout = useMemo(() => normalizeReceptionLayoutConfig(layout, rooms), [layout, rooms]);
    const layoutSignature = useMemo(() => JSON.stringify(normalizedLayout), [normalizedLayout]);
    const [draftLayout, setDraftLayout] = useState<ReceptionLayoutConfig>(normalizedLayout);
    const dragStartPointerRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        setDraftLayout(normalizedLayout);
    }, [layoutSignature, normalizedLayout]);

    const gridLayout = useMemo(() => toGridLayout(rooms, draftLayout), [rooms, draftLayout]);

    const updateDraftLayout = (nextLayout: ReceptionLayoutConfig) => {
        startTransition(() => {
            setDraftLayout(nextLayout);
            onChange(nextLayout);
        });
    };

    const applyGridLayout = (nextGridLayout: Layout[]) => {
        updateDraftLayout(mergeLayoutPositions(draftLayout, rooms, nextGridLayout));
    };

    const handleTileColumnsChange = (roomId: string, nextTileColumns: number) => {
        const nextLayout: ReceptionLayoutConfig = {
            ...draftLayout,
            rooms: draftLayout.rooms.map((item) => {
                if (item.roomId !== roomId) {
                    return item;
                }

                const room = rooms.find((candidate) => candidate.id === roomId);
                const safeMaxColumns = Math.max(1, Math.min(room?.lanes || 1, 6));

                return {
                    ...item,
                    tileColumns: Math.max(1, Math.min(safeMaxColumns, nextTileColumns))
                };
            })
        };
        updateDraftLayout(nextLayout);
    };

    const handleReset = () => {
        updateDraftLayout(createDefaultReceptionLayout(rooms));
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
                    <p className="admin-layout-editor-copy">ドラッグで配置変更、右下ハンドルで横幅変更。レーン列数は各カード内で変更します。</p>
                </div>
                <button type="button" className="admin-layout-editor-reset" onClick={handleReset}>
                    初期配置に戻す
                </button>
            </div>

            <WidthAwareGridLayout
                className="admin-layout-editor-grid"
                layout={gridLayout}
                cols={RECEPTION_LAYOUT_GRID_COLUMNS}
                rowHeight={24}
                margin={[12, 12]}
                containerPadding={[0, 0]}
                compactType={null}
                preventCollision={false}
                draggableHandle=".admin-layout-editor-card-handle"
                draggableCancel=".admin-layout-editor-field,.admin-layout-editor-field *,select,option,.react-resizable-handle"
                isBounded
                onDragStart={(_layout, _oldItem, _newItem, _placeholder, event) => {
                    dragStartPointerRef.current = getPointerPosition(event);
                }}
                onDragStop={(nextGridLayout, oldItem, newItem, _placeholder, event) => {
                    const dragStartPointer = dragStartPointerRef.current;
                    const dragEndPointer = getPointerPosition(event);
                    dragStartPointerRef.current = null;

                    if (dragStartPointer && dragEndPointer) {
                        const dragDistance = Math.hypot(
                            dragEndPointer.x - dragStartPointer.x,
                            dragEndPointer.y - dragStartPointer.y
                        );

                        if (dragDistance < 8) {
                            return;
                        }
                    }

                    if (oldItem.x === newItem.x && oldItem.y === newItem.y) {
                        return;
                    }

                    applyGridLayout(nextGridLayout);
                }}
                onResizeStop={(nextGridLayout) => {
                    applyGridLayout(nextGridLayout);
                }}
            >
                {draftLayout.rooms.map((item) => {
                    const room = rooms.find((candidate) => candidate.id === item.roomId);
                    if (!room) {
                        return null;
                    }

                    const previewColumns = Math.max(1, item.tileColumns);
                    const previewTileCount = room.lanes;

                    return (
                        <div key={item.roomId}>
                            <div className="admin-layout-editor-card">
                                <div className="admin-layout-editor-card-header">
                                    <div className="admin-layout-editor-card-handle">
                                        <span className="inline-flex"><i className="fa-solid fa-grip-vertical"></i></span>
                                        <span>移動</span>
                                    </div>
                                    <span className="admin-layout-editor-card-span">幅 {item.w} / 12</span>
                                </div>

                                <div className="admin-layout-editor-card-body">
                                    <div>
                                        <h4 className="admin-layout-editor-room-name">{room.name}</h4>
                                        <p className="admin-layout-editor-room-meta">全 {room.lanes} レーン</p>
                                    </div>

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

                                    <div
                                        className="admin-layout-editor-preview-grid"
                                        style={{ gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))` }}
                                    >
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
            </WidthAwareGridLayout>
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
