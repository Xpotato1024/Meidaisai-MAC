import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { createDefaultReceptionLayout, formatReceptionWidthRatio, getReceptionEditorCardHeightPx, getReceptionWidthOptions, normalizeReceptionLayoutConfig, packReceptionRoomLayout, RECEPTION_LAYOUT_EDITOR_GAP_PX } from "./reception-layout.js";
import { UI_ICON_SVGS } from "./icons.js";
let editorRoot = null;
let editorContainer = null;
function sortLayoutRooms(layout) {
    return [...layout.rooms].sort((left, right) => left.order - right.order);
}
function reindexLayoutRooms(items) {
    return items.map((item, index) => ({
        ...item,
        order: index
    }));
}
function updateLayoutRoom(currentLayout, roomId, updater) {
    return {
        ...currentLayout,
        rooms: reindexLayoutRooms(sortLayoutRooms(currentLayout).map((item) => item.roomId === roomId ? updater(item) : item))
    };
}
function moveLayoutRoom(currentLayout, draggedRoomId, targetRoomId, placement) {
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
function moveLayoutRoomToEnd(currentLayout, draggedRoomId) {
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
function ReceptionLayoutEditor({ rooms, layout, onChange }) {
    const normalizedLayout = useMemo(() => normalizeReceptionLayoutConfig(layout, rooms), [layout, rooms]);
    const layoutSignature = useMemo(() => JSON.stringify(normalizedLayout), [normalizedLayout]);
    const [draftLayout, setDraftLayout] = useState(normalizedLayout);
    const [draggedRoomId, setDraggedRoomId] = useState(null);
    const [dropIndicator, setDropIndicator] = useState(null);
    const widthOptions = useMemo(() => getReceptionWidthOptions(), []);
    useEffect(() => {
        setDraftLayout(normalizedLayout);
    }, [layoutSignature, normalizedLayout]);
    const orderedRooms = useMemo(() => sortLayoutRooms(draftLayout), [draftLayout]);
    const packedLayout = useMemo(() => packReceptionRoomLayout(rooms, draftLayout, RECEPTION_LAYOUT_EDITOR_GAP_PX, getReceptionEditorCardHeightPx), [rooms, draftLayout]);
    const placementByRoomId = useMemo(() => new Map(packedLayout.placements.map((placement) => [placement.roomId, placement])), [packedLayout]);
    const updateDraftLayout = (nextLayout) => {
        startTransition(() => {
            setDraftLayout(nextLayout);
            onChange(nextLayout);
        });
    };
    const handleTileColumnsChange = (roomId, nextTileColumns) => {
        const nextLayout = updateLayoutRoom(draftLayout, roomId, (item) => ({
            ...item,
            tileColumns: nextTileColumns
        }));
        updateDraftLayout(nextLayout);
    };
    const handleWidthRatioChange = (roomId, nextWidthRatio) => {
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
    const handleDragStart = (roomId, event) => {
        setDraggedRoomId(roomId);
        setDropIndicator(null);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", roomId);
        const dragCard = event.currentTarget.closest(".admin-layout-editor-item");
        if (dragCard) {
            event.dataTransfer.setDragImage(dragCard, 28, 28);
        }
    };
    const handleDragOverCard = (roomId, event) => {
        if (!draggedRoomId || draggedRoomId === roomId) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const placement = (event.clientX - rect.left) < (rect.width / 2) ? "before" : "after";
        setDropIndicator({ roomId, placement });
        event.dataTransfer.dropEffect = "move";
    };
    const handleDropOnCard = (roomId, event) => {
        event.preventDefault();
        event.stopPropagation();
        const droppedRoomId = event.dataTransfer.getData("text/plain") || draggedRoomId;
        if (!droppedRoomId || droppedRoomId === roomId) {
            clearDragState();
            return;
        }
        const nextLayout = moveLayoutRoom(draftLayout, droppedRoomId, roomId, dropIndicator?.roomId === roomId ? dropIndicator.placement : "before");
        updateDraftLayout(nextLayout);
        clearDragState();
    };
    const handleDragOverEnd = (event) => {
        if (!draggedRoomId) {
            return;
        }
        event.preventDefault();
        setDropIndicator({ roomId: "__end__", placement: "after" });
        event.dataTransfer.dropEffect = "move";
    };
    const handleDropOnEnd = (event) => {
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
        return (_jsx("div", { className: "admin-layout-editor-empty", children: "\u90E8\u5C4B\u3092\u8FFD\u52A0\u3059\u308B\u3068\u3001\u3053\u3053\u3067\u53D7\u4ED8\u753B\u9762\u306E\u30EC\u30A4\u30A2\u30A6\u30C8\u3092\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002" }));
    }
    return (_jsxs("div", { className: "admin-layout-editor", children: [_jsxs("div", { className: "admin-layout-editor-toolbar", children: [_jsxs("div", { children: [_jsx("p", { className: "admin-layout-editor-kicker", children: "Edit Mode" }), _jsx("p", { className: "admin-layout-editor-copy", children: "\u30C9\u30E9\u30C3\u30B0\u3067\u4E26\u3073\u66FF\u3048\u3001\u30AB\u30FC\u30C9\u5E45\u3068\u30EC\u30FC\u30F3\u5217\u6570\u3092\u8ABF\u6574\u3057\u307E\u3059\u3002\u53D7\u4ED8\u753B\u9762\u306F\u3053\u306E\u9806\u5E8F\u3067\u81EA\u52D5\u914D\u7F6E\u3055\u308C\u307E\u3059\u3002" })] }), _jsx("button", { type: "button", className: "admin-layout-editor-reset", onClick: handleReset, children: "\u521D\u671F\u914D\u7F6E\u306B\u623B\u3059" })] }), _jsx("div", { className: "admin-layout-editor-canvas", style: { "--editor-canvas-height": `${packedLayout.canvasHeightPx}px` }, onDragOver: handleDragOverEnd, onDrop: handleDropOnEnd, children: orderedRooms.map((item) => {
                    const room = rooms.find((candidate) => candidate.id === item.roomId);
                    const placement = placementByRoomId.get(item.roomId);
                    if (!room) {
                        return null;
                    }
                    const previewColumns = Math.max(1, item.tileColumns);
                    const previewTileCount = room.lanes;
                    const isDragging = draggedRoomId === item.roomId;
                    const dropBefore = dropIndicator?.roomId === item.roomId && dropIndicator.placement === "before";
                    const dropAfter = dropIndicator?.roomId === item.roomId && dropIndicator.placement === "after";
                    const cardStyle = {
                        "--editor-card-span": String(placement?.widthUnits ?? 24),
                        "--editor-card-x": String(placement?.xUnits ?? 0),
                        "--editor-card-y": `${placement?.yPx ?? 0}px`,
                        "--editor-card-height": `${placement?.heightPx ?? getReceptionEditorCardHeightPx(room.lanes, previewColumns)}px`,
                        "--editor-tile-columns": String(previewColumns)
                    };
                    return (_jsx("div", { className: [
                            "admin-layout-editor-item",
                            isDragging ? "is-dragging" : "",
                            dropBefore ? "is-drop-before" : "",
                            dropAfter ? "is-drop-after" : ""
                        ].filter(Boolean).join(" "), style: cardStyle, onDragOver: (event) => handleDragOverCard(item.roomId, event), onDrop: (event) => handleDropOnCard(item.roomId, event), children: _jsxs("div", { className: "admin-layout-editor-card", children: [_jsxs("div", { className: "admin-layout-editor-card-header", children: [_jsxs("div", { className: "admin-layout-editor-card-handle", draggable: true, onDragStart: (event) => handleDragStart(item.roomId, event), onDragEnd: clearDragState, children: [_jsx("span", { className: "inline-flex", dangerouslySetInnerHTML: { __html: UI_ICON_SVGS.grip } }), _jsx("span", { children: "\u79FB\u52D5" })] }), _jsxs("span", { className: "admin-layout-editor-card-span", children: ["\u5E45 ", formatReceptionWidthRatio(item.widthRatio)] })] }), _jsxs("div", { className: "admin-layout-editor-card-body", children: [_jsxs("div", { children: [_jsx("h4", { className: "admin-layout-editor-room-name", children: room.name }), _jsxs("p", { className: "admin-layout-editor-room-meta", children: ["\u5168 ", room.lanes, " \u30EC\u30FC\u30F3"] })] }), _jsxs("div", { className: "admin-layout-editor-field-grid", children: [_jsxs("label", { className: "admin-layout-editor-field", children: [_jsx("span", { children: "\u30AB\u30FC\u30C9\u5E45" }), _jsx("select", { value: String(item.widthRatio), onChange: (event) => handleWidthRatioChange(item.roomId, Number(event.target.value)), children: widthOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.label))) })] }), _jsxs("label", { className: "admin-layout-editor-field", children: [_jsx("span", { children: "\u30EC\u30FC\u30F3\u5217\u6570" }), _jsx("select", { value: item.tileColumns, onChange: (event) => handleTileColumnsChange(item.roomId, Number(event.target.value)), children: Array.from({ length: Math.min(room.lanes, 6) }, (_, index) => index + 1).map((columnCount) => (_jsxs("option", { value: columnCount, children: [columnCount, " \u5217"] }, columnCount))) })] })] }), _jsx("div", { className: "admin-layout-editor-preview-grid", children: Array.from({ length: previewTileCount }, (_, index) => (_jsxs("div", { className: "admin-layout-editor-preview-tile", children: ["L", index + 1] }, `${item.roomId}-${index + 1}`))) })] })] }) }, item.roomId));
                }) }), _jsx("div", { className: [
                    "admin-layout-editor-end-drop",
                    dropIndicator?.roomId === "__end__" ? "is-active" : ""
                ].filter(Boolean).join(" "), onDragOver: handleDragOverEnd, onDrop: handleDropOnEnd, children: "\u672B\u5C3E\u3078\u914D\u7F6E" })] }));
}
export function renderReceptionLayoutEditor({ container, rooms, layout, onChange }) {
    if (editorContainer !== container) {
        editorRoot?.unmount();
        editorRoot = createRoot(container);
        editorContainer = container;
    }
    editorRoot?.render(_jsx(ReceptionLayoutEditor, { rooms: rooms, layout: layout, onChange: onChange }));
}
