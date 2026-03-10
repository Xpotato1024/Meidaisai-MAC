type ToastTone = "info" | "success" | "warning" | "error";

interface ToastOptions {
    title?: string;
    message: string;
    tone?: ToastTone;
    durationMs?: number;
}

const DEFAULT_DURATION_MS = 3800;

function ensureToastRoot(): HTMLElement {
    let root = document.getElementById("toast-root");
    if (!root) {
        root = document.createElement("div");
        root.id = "toast-root";
        root.className = "toast-root";
        document.body.appendChild(root);
    }
    return root;
}

export function showToast(options: ToastOptions): void {
    const root = ensureToastRoot();
    const toast = document.createElement("div");
    const tone = options.tone || "info";
    toast.className = `toast-card toast-card-${tone}`;
    toast.innerHTML = `
        ${options.title ? `<div class="toast-title">${options.title}</div>` : ""}
        <div class="toast-message">${options.message}</div>
    `;

    root.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add("is-visible");
    });

    const removeToast = () => {
        toast.classList.remove("is-visible");
        window.setTimeout(() => {
            toast.remove();
        }, 220);
    };

    const timerId = window.setTimeout(removeToast, options.durationMs || DEFAULT_DURATION_MS);
    toast.addEventListener("click", () => {
        window.clearTimeout(timerId);
        removeToast();
    });
}
