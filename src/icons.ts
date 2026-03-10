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
    google: buildUtilityIcon(
        `
            <path d="M20.2 12.3c0-.72-.06-1.22-.18-1.74H12v3.02h4.7c-.1.75-.66 1.88-1.9 2.64l-.02.1 2.76 2.1.2.02c1.81-1.64 2.86-4.04 2.86-6.14Z" fill="#4285F4" />
            <path d="M12 20.5c2.3 0 4.22-.74 5.62-2.02l-2.94-2.22c-.78.54-1.82.92-2.68.92-2.24 0-4.14-1.46-4.82-3.48l-.1.01-2.87 2.18-.03.1C5.57 18.7 8.55 20.5 12 20.5Z" fill="#34A853" />
            <path d="M7.18 13.7A5.19 5.19 0 0 1 6.9 12c0-.6.1-1.17.26-1.7l-.01-.11-2.9-2.21-.1.04A8.3 8.3 0 0 0 3.3 12c0 1.4.34 2.72.95 3.88l2.93-2.18Z" fill="#FBBC05" />
            <path d="M12 6.82c1.1 0 2.08.37 2.86 1.08l2.09-2.02C15.74 4.78 14.3 4 12 4 8.55 4 5.57 5.8 4.15 8.49l3.02 2.28c.7-2.02 2.58-3.95 4.83-3.95Z" fill="#EA4335" />
        `,
        "status-svg-lg"
    ),
    menu: buildUtilityIcon(
        `
            <path d="M6.5 8.2h11M6.5 12h11M6.5 15.8h11" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
        `,
        "status-svg-xl"
    ),
    close: buildUtilityIcon(
        `
            <path d="m8 8 8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" />
        `,
        "status-svg-xl"
    ),
    plus: buildUtilityIcon(
        `
            <path d="M12 7.5v9M7.5 12h9" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
        `,
        "status-svg-xl"
    ),
    minus: buildUtilityIcon(
        `
            <path d="M7.5 12h9" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
        `,
        "status-svg-xl"
    ),
    triangleDown: buildUtilityIcon(
        `
            <path d="M12 15.8 6.5 9.2h11L12 15.8Z" fill="currentColor" />
        `,
        "status-svg-lg"
    ),
    triangleUp: buildUtilityIcon(
        `
            <path d="M12 8.2 17.5 14.8h-11L12 8.2Z" fill="currentColor" />
        `,
        "status-svg-lg"
    ),
    save: buildUtilityIcon(
        `
            <path d="M7.3 5.5h8.3l2 2v11H6.4v-13Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
            <path d="M9 5.5v4.3h5.4V5.5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
            <path d="M9.1 15.4h5.8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        `,
        "status-svg-lg"
    ),
    trash: buildUtilityIcon(
        `
            <path d="M8.7 8.2v7.1m3.3-7.1v7.1m3.3-7.1v7.1M6.6 6.2h10.8M9.2 6.2l.48-1.2h4.64l.48 1.2M7.7 18.3h8.6a1 1 0 0 0 .98-.87l.72-9.23H6l.72 9.23a1 1 0 0 0 .98.87Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    upload: buildUtilityIcon(
        `
            <path d="M12 5.8v8.3m0-8.3 3 3m-3-3-3 3M6.3 15.8v1.1c0 .72.58 1.3 1.3 1.3h8.8c.72 0 1.3-.58 1.3-1.3v-1.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    search: buildUtilityIcon(
        `
            <circle cx="10.4" cy="10.4" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path d="m14 14 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        `,
        "status-svg-lg"
    ),
    refresh: buildUtilityIcon(
        `
            <path d="M17.1 10.1A5.4 5.4 0 0 0 7.7 8.4M6.9 13.9a5.4 5.4 0 0 0 9.4 1.7M16.8 7.4v2.9h-2.9M7.2 16.6v-2.9h2.9" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    switch: buildUtilityIcon(
        `
            <path d="M5.5 6.6h4.2m0 0L8.1 5m1.6 1.6L8.1 8.2M18.5 17.4h-4.2m0 0 1.6 1.6m-1.6-1.6 1.6-1.6M7.8 12h8.4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    copy: buildUtilityIcon(
        `
            <rect x="8.1" y="7.1" width="8.8" height="10.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="M7.2 14.8H6.5a1.9 1.9 0 0 1-1.9-1.9V6.5a1.9 1.9 0 0 1 1.9-1.9h6.4A1.9 1.9 0 0 1 14.8 6v.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        `,
        "status-svg-lg"
    ),
    export: buildUtilityIcon(
        `
            <path d="M12 5.7v8.1m0-8.1 2.8 2.8M12 5.7 9.2 8.5M6.7 15.8v1.1c0 .74.6 1.35 1.35 1.35h7.9c.75 0 1.35-.61 1.35-1.35v-1.1" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    import: buildUtilityIcon(
        `
            <path d="M12 18.3v-8.1m0 8.1 2.8-2.8M12 18.3l-2.8-2.8M6.7 8.2V7.1c0-.74.6-1.35 1.35-1.35h7.9c.75 0 1.35.61 1.35 1.35v1.1" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    signature: buildUtilityIcon(
        `
            <path d="M5.8 16.8c1.7-2.7 3.1-4 4.3-4 .92 0 1.14.87 1.83.87 1 0 1.65-2.6 3.2-2.6 1 0 1.7.86 2.28 2.55" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M5.8 19h12.4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" />
        `,
        "status-svg-lg"
    ),
    fileArrowUp: buildUtilityIcon(
        `
            <path d="M8 4.8h6l3 3v10.4a1.8 1.8 0 0 1-1.8 1.8H8a1.8 1.8 0 0 1-1.8-1.8V6.6A1.8 1.8 0 0 1 8 4.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            <path d="M12 15.3V9.1m0 0 2.2 2.2M12 9.1l-2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        `,
        "status-svg-lg"
    ),
    grip: buildUtilityIcon(
        `
            <circle cx="8.2" cy="8" r="1.1" fill="currentColor" />
            <circle cx="8.2" cy="12" r="1.1" fill="currentColor" />
            <circle cx="8.2" cy="16" r="1.1" fill="currentColor" />
            <circle cx="12" cy="8" r="1.1" fill="currentColor" />
            <circle cx="12" cy="12" r="1.1" fill="currentColor" />
            <circle cx="12" cy="16" r="1.1" fill="currentColor" />
        `,
        "status-svg-lg"
    ),
    spinner: buildUtilityIcon(
        `
            <circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="2" opacity=".22" />
            <path d="M12 5a7 7 0 0 1 6.1 3.55" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        `,
        "status-svg-lg icon-spin"
    )
};
