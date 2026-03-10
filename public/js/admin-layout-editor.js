import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState, startTransition } from "react";
import { createRoot } from "react-dom/client";
import GridLayout, { WidthProvider } from "react-grid-layout";
import { createDefaultReceptionLayout, getReceptionEditorCardHeight, normalizeReceptionLayoutConfig, RECEPTION_LAYOUT_GRID_COLUMNS } from "./reception-layout.js";
const WidthAwareGridLayout = WidthProvider(GridLayout);
let editorRoot = null;
let editorContainer = null;
function toGridLayout(rooms, layout) {
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
function mergeLayoutPositions(currentLayout, rooms, nextGridLayout) {
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
function ReceptionLayoutEditor({ rooms, layout, onChange }) {
    const normalizedLayout = useMemo(() => normalizeReceptionLayoutConfig(layout, rooms), [layout, rooms]);
    const layoutSignature = useMemo(() => JSON.stringify(normalizedLayout), [normalizedLayout]);
    const [draftLayout, setDraftLayout] = useState(normalizedLayout);
    useEffect(() => {
        setDraftLayout(normalizedLayout);
    }, [layoutSignature, normalizedLayout]);
    const gridLayout = useMemo(() => toGridLayout(rooms, draftLayout), [rooms, draftLayout]);
    const updateDraftLayout = (nextLayout) => {
        startTransition(() => {
            setDraftLayout(nextLayout);
            onChange(nextLayout);
        });
    };
    const applyGridLayout = (nextGridLayout) => {
        updateDraftLayout(mergeLayoutPositions(draftLayout, rooms, nextGridLayout));
    };
    const handleTileColumnsChange = (roomId, nextTileColumns) => {
        const nextLayout = {
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
        return (_jsx("div", { className: "admin-layout-editor-empty", children: "\u90E8\u5C4B\u3092\u8FFD\u52A0\u3059\u308B\u3068\u3001\u3053\u3053\u3067\u53D7\u4ED8\u753B\u9762\u306E\u30EC\u30A4\u30A2\u30A6\u30C8\u3092\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002" }));
    }
    return (_jsxs("div", { className: "admin-layout-editor", children: [_jsxs("div", { className: "admin-layout-editor-toolbar", children: [_jsxs("div", { children: [_jsx("p", { className: "admin-layout-editor-kicker", children: "Edit Mode" }), _jsx("p", { className: "admin-layout-editor-copy", children: "\u30C9\u30E9\u30C3\u30B0\u3067\u914D\u7F6E\u5909\u66F4\u3001\u53F3\u4E0B\u30CF\u30F3\u30C9\u30EB\u3067\u6A2A\u5E45\u5909\u66F4\u3002\u30EC\u30FC\u30F3\u5217\u6570\u306F\u5404\u30AB\u30FC\u30C9\u5185\u3067\u5909\u66F4\u3057\u307E\u3059\u3002" })] }), _jsx("button", { type: "button", className: "admin-layout-editor-reset", onClick: handleReset, children: "\u521D\u671F\u914D\u7F6E\u306B\u623B\u3059" })] }), _jsx(WidthAwareGridLayout, { className: "admin-layout-editor-grid", layout: gridLayout, cols: RECEPTION_LAYOUT_GRID_COLUMNS, rowHeight: 24, margin: [12, 12], containerPadding: [0, 0], compactType: null, preventCollision: false, draggableHandle: ".admin-layout-editor-card-header", draggableCancel: ".admin-layout-editor-field,.admin-layout-editor-field *,select,option,.react-resizable-handle", isBounded: true, onDragStop: (nextGridLayout) => {
                    applyGridLayout(nextGridLayout);
                }, onResizeStop: (nextGridLayout) => {
                    applyGridLayout(nextGridLayout);
                }, children: draftLayout.rooms.map((item) => {
                    const room = rooms.find((candidate) => candidate.id === item.roomId);
                    if (!room) {
                        return null;
                    }
                    const previewColumns = Math.max(1, item.tileColumns);
                    const previewTileCount = room.lanes;
                    return (_jsx("div", { children: _jsxs("div", { className: "admin-layout-editor-card", children: [_jsxs("div", { className: "admin-layout-editor-card-header", children: [_jsxs("div", { className: "admin-layout-editor-card-handle", children: [_jsx("span", { className: "inline-flex", children: _jsx("i", { className: "fa-solid fa-grip-vertical" }) }), _jsx("span", { children: "\u79FB\u52D5" })] }), _jsxs("span", { className: "admin-layout-editor-card-span", children: ["\u5E45 ", item.w, " / 12"] })] }), _jsxs("div", { className: "admin-layout-editor-card-body", children: [_jsxs("div", { children: [_jsx("h4", { className: "admin-layout-editor-room-name", children: room.name }), _jsxs("p", { className: "admin-layout-editor-room-meta", children: ["\u5168 ", room.lanes, " \u30EC\u30FC\u30F3"] })] }), _jsxs("label", { className: "admin-layout-editor-field", children: [_jsx("span", { children: "\u30EC\u30FC\u30F3\u5217\u6570" }), _jsx("select", { value: item.tileColumns, onChange: (event) => handleTileColumnsChange(item.roomId, Number(event.target.value)), children: Array.from({ length: Math.min(room.lanes, 6) }, (_, index) => index + 1).map((columnCount) => (_jsxs("option", { value: columnCount, children: [columnCount, " \u5217"] }, columnCount))) })] }), _jsx("div", { className: "admin-layout-editor-preview-grid", style: { gridTemplateColumns: `repeat(${previewColumns}, minmax(0, 1fr))` }, children: Array.from({ length: previewTileCount }, (_, index) => (_jsxs("div", { className: "admin-layout-editor-preview-tile", children: ["L", index + 1] }, `${item.roomId}-${index + 1}`))) })] })] }) }, item.roomId));
                }) })] }));
}
export function renderReceptionLayoutEditor({ container, rooms, layout, onChange }) {
    if (editorContainer !== container) {
        editorRoot?.unmount();
        editorRoot = createRoot(container);
        editorContainer = container;
    }
    editorRoot?.render(_jsx(ReceptionLayoutEditor, { rooms: rooms, layout: layout, onChange: onChange }));
}
