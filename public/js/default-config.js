// --- アプリケーション設定 ---
export const APP_CONFIG = {
    eventName: "名称未設定イベント",
    // 部屋と各部屋のレーン数
    rooms: [
        { id: "room1", name: "A部屋", lanes: 4 },
        { id: "room2", name: "B部屋", lanes: 3 },
        { id: "room3", name: "C部屋", lanes: 2 }
    ],
    // レーン担当者が設定するステータス
    laneStatuses: [
        { id: "available", name: "空き", colorClass: "status-available", icon: "🟢" },
        { id: "occupied", name: "使用中", colorClass: "status-occupied", icon: "🔴" },
        { id: "preparing", name: "準備中", colorClass: "status-preparing", icon: "🟡" },
        { id: "paused", name: "休止中", colorClass: "status-paused", icon: "⏸️" }
    ],
    // 受付が設定するステータス
    receptionStatuses: [
        { id: "available", name: "案内可", colorClass: "reception-available", icon: "✅" },
        { id: "guiding", name: "案内中", colorClass: "reception-guiding", icon: "🔀" }
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
