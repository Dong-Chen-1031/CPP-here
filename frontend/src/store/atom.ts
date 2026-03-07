import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";

export const editorStore = atom<RefObject<ReactCodeMirrorRef | null> | null>(
  null,
);
export const codeStore = atomWithStorage<string>(
  "code",
  '#include <iostream>\n\nint main() {\n  std::cout << "Hello World";\n  return 0;\n}',
);
export const cppVersionStore = atomWithStorage<string>("cppVersion", "c++17");
export const inputStore = atomWithStorage<string>("input", "");
export const outputStore = atomWithStorage<string>("output", "");
