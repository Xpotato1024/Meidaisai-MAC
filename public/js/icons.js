function buildIcon(path, extraClass = "") {
    return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
             class="inline-block h-4 w-4 align-[-0.125em] ${extraClass}" aria-hidden="true">
            ${path}
        </svg>
    `;
}
export const STATUS_ICON_SVGS = {
    available: buildIcon(`
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75" />
        <circle cx="12" cy="12" r="9" />
    `),
    occupied: buildIcon(`
        <path stroke-linecap="round" stroke-linejoin="round" d="m14.25 9.75-4.5 4.5m0-4.5 4.5 4.5" />
        <circle cx="12" cy="12" r="9" />
    `),
    preparing: buildIcon(`
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 5.25a1.5 1.5 0 0 1 2.121 2.121l-1.19 1.19 1.409 1.409a1.5 1.5 0 0 1 0 2.121l-3.75 3.75a1.5 1.5 0 0 1-2.121 0l-1.409-1.409-2.19 2.19H5.25v-1.871l2.19-2.19-1.409-1.409a1.5 1.5 0 0 1 0-2.121l3.75-3.75a1.5 1.5 0 0 1 2.121 0l1.409 1.409 1.19-1.19Z" />
    `),
    paused: buildIcon(`
        <circle cx="12" cy="12" r="9" />
        <path stroke-linecap="round" d="M10 9v6m4-6v6" />
    `),
    receptionAvailable: buildIcon(`
        <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 12.75 9 16.5l9.75-9.75" />
    `),
    guiding: buildIcon(`
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12h9m0 0-3.75-3.75M13.5 12l-3.75 3.75M19.5 7.5l-3 3m0 0 3 3" />
    `)
};
