import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";

export interface TestCase {
  id: string;
  name: string;
  input: string;
}

export const editorStore = atom<RefObject<ReactCodeMirrorRef | null> | null>(
  null,
);
export const codeStore = atomWithStorage<string>(
  "code",
  `#include <iostream>\n\nint main() {\n  std::cout << "Hello World";\n  return 0;\n}`,
);
export const cppVersionStore = atomWithStorage<string>("cppVersion", "c++17");
export const inputStore = atomWithStorage<string>("input", "");
export const outputStore = atomWithStorage<string[]>("output", []);
export const runModeStore = atomWithStorage<"single" | "all">(
  "runMode",
  "single",
);
export const testCasesStore = atomWithStorage<TestCase[]>("testCases", [
  { id: "example-1", name: "Test Case 1", input: "Example input 1" },
  { id: "example-2", name: "Test Case 2", input: "Example input 2" },
  { id: "example-3", name: "Test Case 3", input: "Example input 3" },
]);
