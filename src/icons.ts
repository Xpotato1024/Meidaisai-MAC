function buildStatusIcon(accent: string, tint: string, symbolMarkup: string, extraClass = ""): string {
    return `
        <svg viewBox="0 0 24 24" fill="none" class="status-svg ${extraClass}" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="6" fill="${tint}" />
            ${symbolMarkup.replaceAll("__ACCENT__", accent)}
        </svg>
    `;
}

function buildUtilityIcon(markup: string, extraClass = ""): string {
    return `
        <svg viewBox="0 0 24 24" fill="none" class="status-svg ${extraClass}" aria-hidden="true">
            ${markup}
        </svg>
    `;
}

export const STATUS_ICON_SVGS = {
    available: buildStatusIcon(
        "#059669",
        "#ecfdf5",
        '<path d="M8.1 12.3 10.55 14.75 15.9 9.4" stroke="__ACCENT__" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />'
    ),
    occupied: buildStatusIcon(
        "#e11d48",
        "#fff1f2",
        '<path d="m9.1 9.1 5.8 5.8m0-5.8-5.8 5.8" stroke="__ACCENT__" stroke-width="2.1" stroke-linecap="round" />'
    ),
    preparing: buildStatusIcon(
        "#d97706",
        "#fffbeb",
        '<path d="M12 7v3m0 4v3m5-5h-3m-4 0H7m8.05-3.05-2.1 2.1m-1.9 1.9-2.1 2.1m0-6.1 2.1 2.1m1.9 1.9 2.1 2.1" stroke="__ACCENT__" stroke-width="1.8" stroke-linecap="round" />'
    ),
    paused: buildStatusIcon(
        "#475569",
        "#f1f5f9",
        '<path d="M10 8.35v7.3m4-7.3v7.3" stroke="__ACCENT__" stroke-width="2.1" stroke-linecap="round" />'
    ),
    receptionAvailable: buildStatusIcon(
        "#2563eb",
        "#eff6ff",
        '<path d="M8 12.2h8m0 0-3.1-3.1M16 12.2l-3.1 3.1" stroke="__ACCENT__" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />'
    ),
    guiding: buildStatusIcon(
        "#1d4ed8",
        "#eff6ff",
        '<path d="M7.2 12h6.9m0 0-2.5-2.5m2.5 2.5-2.5 2.5M16.8 8.2v7.6" stroke="__ACCENT__" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round" />'
    )
};

export const UI_ICON_SVGS = {
    queue: buildUtilityIcon(
        `
            <rect x="3" y="3" width="18" height="18" rx="6" fill="#fff1f2" />
            <circle cx="9" cy="9.2" r="2" fill="#fb7185" />
            <circle cx="15.4" cy="10.2" r="1.8" fill="#fda4af" />
            <path d="M6.1 16.8c.25-1.9 1.73-3.15 3.65-3.15h.58c1.9 0 3.36 1.25 3.61 3.15" stroke="#e11d48" stroke-width="1.6" stroke-linecap="round" />
            <path d="M13.7 16.8c.18-1.18 1.12-2.05 2.31-2.05h.32c1.13 0 2.1.78 2.34 1.87" stroke="#fb7185" stroke-width="1.45" stroke-linecap="round" />
        `,
        "status-svg-lg"
    ),
    full: buildUtilityIcon(
        `
            <rect x="3" y="3" width="18" height="18" rx="6" fill="#f1f5f9" />
            <path d="m8.1 8.1 7.8 7.8" stroke="#475569" stroke-width="1.95" stroke-linecap="round" />
            <path d="M15.9 8.1 8.1 15.9" stroke="#94a3b8" stroke-width="1.95" stroke-linecap="round" />
        `,
        "status-svg-lg"
    ),
    options: buildUtilityIcon(
        `
            <rect x="3" y="3" width="18" height="18" rx="6" fill="#eff6ff" />
            <path d="M8 8.5h8M8 12h8M8 15.5h5.6" stroke="#2563eb" stroke-width="1.7" stroke-linecap="round" />
            <circle cx="6.2" cy="8.5" r=".95" fill="#2563eb" />
            <circle cx="6.2" cy="12" r=".95" fill="#2563eb" />
            <circle cx="6.2" cy="15.5" r=".95" fill="#2563eb" />
        `
    ),
    note: buildUtilityIcon(
        `
            <rect x="4" y="4" width="16" height="16" rx="5" fill="#fffbeb" />
            <path d="M8 9.4h8M8 12.4h8M8 15.4h5.2" stroke="#d97706" stroke-width="1.75" stroke-linecap="round" />
        `
    ),
    arrival: buildUtilityIcon(
        `
            <rect x="3" y="3" width="18" height="18" rx="6" fill="#ecfdf5" />
            <path d="M8.2 12.2 10.65 14.65 15.8 9.5" stroke="#059669" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    plus: buildUtilityIcon(
        `
            <path d="M12 7.5v9M7.5 12h9" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" />
        `,
        "status-svg-xl"
    ),
    minus: buildUtilityIcon(
        `
            <path d="M7.5 12h9" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round" />
        `,
        "status-svg-xl"
    )
};
