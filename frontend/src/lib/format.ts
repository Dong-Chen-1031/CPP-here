import { codeFormatStyle, editorTabSizeStore } from "@/store/configStore";
import init, { format, type Style } from "@wasm-fmt/clang-format/vite";
import { getDefaultStore } from "jotai";

let initPromise: Promise<unknown> | null = null;
const defaultStore = getDefaultStore();

export function ensureFormatterInit() {
    if (!initPromise) {
        initPromise = init().catch((err) => {
            initPromise = null;
            throw err;
        });
    }
    return initPromise;
}

export async function formatCode(
    code: string,
    {
        style = "Default",
    }: {
        style?:
            | Style
            | "Default"
            | {
                  BasedOnStyle: Style | "Default";
                  IndentWidth: number;
                  ColumnLimit?: number;
              };
    } = {},
) {
    if (style === "Default") {
        style = {
            BasedOnStyle: defaultStore.get(codeFormatStyle),
            IndentWidth: defaultStore.get(editorTabSizeStore),
            ColumnLimit: 0,
        };
    }
    if (
        typeof style === "object" &&
        "BasedOnStyle" in style &&
        style.BasedOnStyle === "Default"
    ) {
        style = {
            ...style,
            BasedOnStyle: defaultStore.get(codeFormatStyle),
        };
    }
    try {
        await ensureFormatterInit();
        if (typeof style === "object") {
            style = JSON.stringify(style);
        }
        return format(code, "main.cpp", style);
    } catch (err) {
        console.error("Failed to format code:", err);
        return code;
    }
}
