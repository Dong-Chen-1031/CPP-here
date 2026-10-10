import { clsx, type ClassValue } from "clsx";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** crypto.randomUUID, which insecure origins (the dev server by LAN IP) lack. */
export function randomId(): string {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
        "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia("(max-width: 768px)");
        const handler = (e: { matches: boolean }) => setIsMobile(e.matches);

        // Set initial value inside useEffect
        setIsMobile(mql.matches);

        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, []);

    return isMobile;
}
export const isMac =
    typeof navigator !== "undefined" && navigator.platform?.includes("Mac");

export const commandKeyIcon = isMac ? "⌘" : "Ctrl";

export const commandKeyPress = (e: KeyboardEvent) =>
    isMac ? e.metaKey : e.ctrlKey;

export const optionsKeyIcon = isMac ? "⌥" : "Alt";

export const shiftKeyIcon = "⇧";
