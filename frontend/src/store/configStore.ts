import type { Style } from "@wasm-fmt/clang-format";
import { atomWithStorage, RESET, useResetAtom } from "jotai/utils";
import { DEFAULT_TIME_LIMIT_S } from "@/config/runLimits";

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

    return () => {
        resetTimeLimit();
        resetEditorTabSize();
        resetEditorFontSize();
        resetDefCode();
        resetCodeFormatStyle();
    };
}
