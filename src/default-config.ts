import type { AppConfig } from "./types.js";
import { STATUS_ICON_SVGS } from "./icons.js";

// --- アプリケーション設定 ---
export const APP_CONFIG: AppConfig = {
    eventName: "名称未設定イベント",
    // 部屋と各部屋のレーン数
    rooms: [
        { id: "room1", name: "A部屋", lanes: 4 },
        { id: "room2", name: "B部屋", lanes: 3 },
        { id: "room3", name: "C部屋", lanes: 2 }
    ],
    // レーン担当者が設定するステータス
    laneStatuses: [
        { id: "available", name: "空き", colorClass: "status-available", icon: STATUS_ICON_SVGS.available },
        { id: "occupied", name: "使用中", colorClass: "status-occupied", icon: STATUS_ICON_SVGS.occupied },
        { id: "preparing", name: "準備中", colorClass: "status-preparing", icon: STATUS_ICON_SVGS.preparing },
        { id: "paused", name: "休止中", colorClass: "status-paused", icon: STATUS_ICON_SVGS.paused }
    ],
    // 受付が設定するステータス
    receptionStatuses: [
        { id: "available", name: "案内可", colorClass: "reception-available", icon: STATUS_ICON_SVGS.receptionAvailable },
        { id: "guiding", name: "案内中", colorClass: "reception-guiding", icon: STATUS_ICON_SVGS.guiding }
    ],
    // オプション設定
    options: [
        { id: "opt1", name: "プランA" },
        { id: "opt2", name: "プランB" },
        { id: "opt3", name: "プランC" }
    ],
    // 休止理由
    pauseReasons: [
        { id: "reason1", name: "機材トラブル" },
        { id: "reason2", name: "清掃中" },
        { id: "reason3", name: "その他" }
    ]
};
// --- 設定ここまで ---
