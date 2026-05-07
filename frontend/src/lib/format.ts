import init, { format, type Style } from "@wasm-fmt/clang-format/vite";

let initPromise: Promise<unknown> | null = null;

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
        style = { BasedOnStyle: "Google", IndentWidth: 4 },
    }: {
        style?:
            | Style
            | {
                  BasedOnStyle: Style;
                  IndentWidth: number;
                  ColumnLimit?: number;
              };
    } = {},
) {
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
