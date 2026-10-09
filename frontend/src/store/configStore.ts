import type { Style } from "@wasm-fmt/clang-format";
import { atom } from "jotai";
import { atomWithStorage, RESET, useResetAtom } from "jotai/utils";
import { DEFAULT_TIME_LIMIT_S } from "@/config/runLimits";
import { featureFlagsStore } from "./featureFlagStore";

export const codeFormatStyle = atomWithStorage<Style>(
    "codeFormatStyle",
    "Google",
);

export const editorFontSizeStore = atomWithStorage<number>("fontSize", 13);
export const editorTabSizeStore = atomWithStorage<number>("tabSize", 4);
/** Seconds before a run is stopped with TLE; NO_TIME_LIMIT (-1) disables it. */
export const timeLimitStore = atomWithStorage<number>(
    "timeLimit",
    DEFAULT_TIME_LIMIT_S,
    undefined,
    { getOnInit: true },
);

export type CompilerMode = "auto" | "browser" | "server";

const COMPILER_FLAG_MODES = new Map<unknown, CompilerMode>([
    ["auto", "auto"],
    ["server", "server"],
    ["in-browser", "browser"],
]);

/**
 * The compiler-menu flag: the default compiler mode, or null when it hides the
 * setting and leaves only the server ("disable", the flag off, or an unknown
 * variant). Auto until PostHog has ever reported flags.
 */
export const compilerFlagStore = atom<CompilerMode | null>((get) => {
    const flags = get(featureFlagsStore);
    if (!flags) return "auto";
    return COMPILER_FLAG_MODES.get(flags["compiler-menu"]) ?? null;
});

/** The mode the user picked; null leaves it to the compiler-menu flag. */
const compilerChoiceStore = atomWithStorage<CompilerMode | null>(
    "compilerMode",
    null,
    undefined,
    { getOnInit: true },
);

/** Which compiler builds the code; see service/build.ts. */
export const compilerModeStore = atom(
    (get): CompilerMode =>
        get(compilerChoiceStore) ?? get(compilerFlagStore) ?? "auto",
    (_get, set, mode: CompilerMode | typeof RESET) =>
        set(compilerChoiceStore, mode),
);

export const defCodeStore = atomWithStorage<string>(
    "defCode",
    `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello C++ Here";\n    return 0;\n}`,
);

export function useResetSettingsAtoms() {
    const resetEditorFontSize = useResetAtom(editorFontSizeStore);
    const resetDefCode = useResetAtom(defCodeStore);
    const resetCodeFormatStyle = useResetAtom(codeFormatStyle);
    const resetEditorTabSize = useResetAtom(editorTabSizeStore);
    const resetTimeLimit = useResetAtom(timeLimitStore);
    const resetCompilerMode = useResetAtom(compilerModeStore);

    return () => {
        resetTimeLimit();
        resetCompilerMode();
        resetEditorTabSize();
        resetEditorFontSize();
        resetDefCode();
        resetCodeFormatStyle();
    };
}
