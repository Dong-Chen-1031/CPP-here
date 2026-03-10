import { atom } from "jotai";
import { atomWithStorage, useResetAtom } from "jotai/utils";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";
export interface TestCase {
  id: string;
  name: string;
  input: string;
}

export interface OutputCase {
  type?: "stdout" | "err";
  testCaseId?: string;
  testCaseName?: string;
  expectedOutput?: string;
  content: string;
}

export const editorStore = atom<RefObject<ReactCodeMirrorRef | null> | null>(
  null,
);
export const codeStore = atomWithStorage<string>(
  "code",
  `#include <iostream>\nusing namespace std;\n\nint main() {\n  cout << "Hello C++ Here";\n  return 0;\n}`,
);
export const cppVersionStore = atomWithStorage<string>("cppVersion", "c++17");
export const inputStore = atomWithStorage<string>("input", "");
export const outputStore = atomWithStorage<OutputCase[]>("output", []);
export const runModeStore = atomWithStorage<"single" | "all">(
  "runMode",
  "single",
);
export const testCasesStore = atomWithStorage<TestCase[]>("testCases", [
  { id: "example-1", name: "Test Case 1", input: "Example input 1" },
  { id: "example-2", name: "Test Case 2", input: "Example input 2" },
  { id: "example-3", name: "Test Case 3", input: "Example input 3" },
]);

export const verifyJwtStore = atom<string | null>(null);

export function useResetAllAtoms() {
  const resetCode = useResetAtom(codeStore);
  const resetCppVersion = useResetAtom(cppVersionStore);
  const resetInput = useResetAtom(inputStore);
  const resetOutput = useResetAtom(outputStore);
  const resetRunMode = useResetAtom(runModeStore);
  const resetTestCases = useResetAtom(testCasesStore);

  return () => {
    resetCode();
    resetCppVersion();
    resetInput();
    resetOutput();
    resetRunMode();
    resetTestCases();
  };
}
