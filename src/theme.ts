import type { AppContext } from "./types.js";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "lineomega-theme";

function resolvePreferredTheme(): ThemeMode {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
        return stored;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getCurrentTheme(): ThemeMode {
    const current = document.documentElement.dataset.theme;
    return current === "dark" ? "dark" : "light";
}

function getThemeIcon(theme: ThemeMode): string {
    if (theme === "dark") {
        return `
            <svg viewBox="0 0 24 24" fill="none" class="status-svg status-svg-xl" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" fill="currentColor" />
                <path d="M12 4.2v2.1M12 17.7v2.1M19.8 12h-2.1M6.3 12H4.2M17.52 6.48l-1.48 1.48M7.96 16.04l-1.48 1.48M17.52 17.52l-1.48-1.48M7.96 7.96 6.48 6.48" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            </svg>
        `;
    }

    return `
        <svg viewBox="0 0 24 24" fill="none" class="status-svg status-svg-xl" aria-hidden="true">
            <path d="M14.8 4.8a6.7 6.7 0 1 0 4.4 11.7A7.4 7.4 0 0 1 14.8 4.8Z" fill="currentColor" />
        </svg>
    `;
}

export function applyTheme(theme: ThemeMode, context?: AppContext): void {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);

    if (context) {
        context.dom.themeToggleBtn.setAttribute("aria-pressed", String(theme === "dark"));
        context.dom.themeToggleBtn.setAttribute("aria-label", theme === "dark" ? "ライトモードへ切替" : "ダークモードへ切替");
        context.dom.themeToggleIcon.innerHTML = getThemeIcon(theme);
    }
}

export function initializeThemeToggle(context: AppContext): void {
    const theme = resolvePreferredTheme();
    applyTheme(theme, context);

    context.dom.themeToggleBtn.addEventListener("click", () => {
        const nextTheme: ThemeMode = getCurrentTheme() === "dark" ? "light" : "dark";
        applyTheme(nextTheme, context);
    });
}
