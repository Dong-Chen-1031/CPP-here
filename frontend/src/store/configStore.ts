import type { Style } from "@wasm-fmt/clang-format";
import { atomWithStorage, RESET, useResetAtom } from "jotai/utils";

export const codeFormatStyle = atomWithStorage<Style>(
    "codeFormatStyle",
    "Google",
);

export const editorFontSizeStore = atomWithStorage<number>("fontSize", 13);
export const editorTabSizeStore = atomWithStorage<number>("tabSize", 4);

export const defCodeStore = atomWithStorage<string>(
    "defCode",
    `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello C++ Here";\n    return 0;\n}`,
);

export function useResetSettingsAtoms() {
    const resetEditorFontSize = useResetAtom(editorFontSizeStore);
    const resetDefCode = useResetAtom(defCodeStore);
    const resetCodeFormatStyle = useResetAtom(codeFormatStyle);
    const resetEditorTabSize = useResetAtom(editorTabSizeStore);

    return () => {
        resetEditorTabSize();
        resetEditorFontSize();
        resetDefCode();
        resetCodeFormatStyle();
    };
}
