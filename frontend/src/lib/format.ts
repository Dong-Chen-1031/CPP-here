import { codeFormatStyle, editorTabSizeStore } from "@/store/configStore";
import init, { format, type Style } from "@wasm-fmt/clang-format/vite";
import { getDefaultStore } from "jotai";
import i18next from "i18next";
import { addAlert } from "@/lib/alert";

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
    await ensureFormatterInit();
    if (typeof style === "object") {
        style = JSON.stringify(style);
    }
    return format(code, "main.cpp", style);
}

export function alertFormatFailed(err: unknown) {
    console.error("Failed to format code:", err);
    addAlert({
        title: i18next.t("editor:format.failedTitle"),
        description: i18next.t("editor:format.failedDescription"),
        variant: "destructive",
    });
}
