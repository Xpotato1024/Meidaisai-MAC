function buildOrbIcon(primary, highlight, symbolMarkup, extraClass = "") {
    return `
        <svg viewBox="0 0 24 24" fill="none" class="status-svg ${extraClass}" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="${primary}" />
            <circle cx="8.4" cy="8.2" r="5.4" fill="${highlight}" opacity="0.95" />
            <circle cx="15" cy="14.6" r="6.25" fill="#ffffff" opacity="0.12" />
            ${symbolMarkup}
        </svg>
    `;
}
function buildUtilityIcon(markup, extraClass = "") {
    return `
        <svg viewBox="0 0 24 24" fill="none" class="status-svg ${extraClass}" aria-hidden="true">
            ${markup}
        </svg>
    `;
}
export const STATUS_ICON_SVGS = {
    available: buildOrbIcon("#10b981", "#6ee7b7", '<path d="M8.6 12.4 10.95 14.7 15.45 9.55" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" />'),
    occupied: buildOrbIcon("#ef4444", "#fda4af", '<path d="m9.15 9.15 5.7 5.7m0-5.7-5.7 5.7" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" />'),
    preparing: buildOrbIcon("#f59e0b", "#fde68a", '<path d="M12 7v3m0 4v3m5-5h-3m-4 0H7m8.2-3.2-2.1 2.1m-2.2 2.2-2.1 2.1m0-6.4 2.1 2.1m2.2 2.2 2.1 2.1" stroke="#ffffff" stroke-width="2.05" stroke-linecap="round" />'),
    paused: buildOrbIcon("#64748b", "#cbd5e1", '<path d="M10 8.3v7.4m4-7.4v7.4" stroke="#ffffff" stroke-width="2.35" stroke-linecap="round" />'),
    receptionAvailable: buildOrbIcon("#14b8a6", "#99f6e4", '<path d="M7.45 12.25 10.15 15l6.45-6.65" stroke="#ffffff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />'),
    guiding: buildOrbIcon("#2563eb", "#93c5fd", '<path d="M7 12h8.25m0 0-3.25-3.25M15.25 12 12 15.25" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />')
};
export const UI_ICON_SVGS = {
    queue: buildUtilityIcon(`
            <circle cx="8.25" cy="9.1" r="2.6" fill="#fb7185" />
            <circle cx="15.9" cy="10.25" r="2.3" fill="#fda4af" />
            <path d="M4.8 18.1c.4-2.35 2.25-3.95 4.65-3.95h1.55c2.4 0 4.25 1.6 4.65 3.95" stroke="#be123c" stroke-width="1.8" stroke-linecap="round" />
            <path d="M13.45 18.1c.22-1.55 1.45-2.7 3-2.7h.55c1.4 0 2.58 1.02 2.88 2.45" stroke="#e11d48" stroke-width="1.6" stroke-linecap="round" />
        `, "status-svg-lg"),
    full: buildUtilityIcon(`
            <circle cx="12" cy="12" r="9" fill="#cbd5e1" />
            <path d="M8 8l8 8" stroke="#475569" stroke-width="2.1" stroke-linecap="round" />
            <path d="M16 8 8 16" stroke="#475569" stroke-width="2.1" stroke-linecap="round" opacity="0.55" />
        `, "status-svg-lg"),
    options: buildUtilityIcon(`
            <rect x="4.5" y="5.5" width="15" height="13" rx="4.5" fill="#dbeafe" />
            <path d="M8 9h8M8 12h8M8 15h5" stroke="#1d4ed8" stroke-width="1.8" stroke-linecap="round" />
            <circle cx="6.3" cy="9" r="1" fill="#2563eb" />
            <circle cx="6.3" cy="12" r="1" fill="#2563eb" />
            <circle cx="6.3" cy="15" r="1" fill="#2563eb" />
        `),
    note: buildUtilityIcon(`
            <path d="M6.5 5.5h8.6L18 8.4v9.1a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 17.5v-10A2 2 0 0 1 6.5 5.5Z" fill="#fef3c7" />
            <path d="M15.1 5.5v2.4a.9.9 0 0 0 .9.9H18" fill="#fde68a" />
            <path d="M8 11h7M8 14h5" stroke="#b45309" stroke-width="1.8" stroke-linecap="round" />
        `),
    arrival: buildUtilityIcon(`
            <rect x="4.75" y="4.75" width="14.5" height="14.5" rx="4.75" fill="#dcfce7" />
            <path d="M8.2 12.1 10.55 14.45 15.8 9.2" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        `, "status-svg-lg"),
    plus: buildUtilityIcon(`
            <circle cx="12" cy="12" r="10" fill="#ffffff" fill-opacity="0.16" />
            <path d="M12 7.5v9M7.5 12h9" stroke="#ffffff" stroke-width="2.35" stroke-linecap="round" />
        `, "status-svg-xl"),
    minus: buildUtilityIcon(`
            <circle cx="12" cy="12" r="10" fill="#ffffff" fill-opacity="0.16" />
            <path d="M7.5 12h9" stroke="#ffffff" stroke-width="2.35" stroke-linecap="round" />
        `, "status-svg-xl")
};
