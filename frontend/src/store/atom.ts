import { atom } from "jotai";
import { atomWithStorage, useResetAtom } from "jotai/utils";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import type { CodeWorker } from "@/api/run";
import type { AlertDialogOptions } from "@/components/Alert";
export interface TestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput?: string;
}

export interface OutputCase {
  type?: "stdout" | "err";
  testCaseId?: string;
  testCaseName?: string;
  expectedOutput?: string;
  content: string;
  status?: "running" | "ac" | "error" | "wa" | "finished";
}

export type PanelDrawerView = "input" | "testCases" | "output";

export const alertStore = atom<
  {
    title: string;
    description: string;
    variant?: "default" | "destructive";
    className?: string;
    id: string;
    icon?: React.ReactNode;
  }[]
>([]);

export const loadedCountStore = atom(0);

export const loadedStore = atom((get) => get(loadedCountStore) >= 3);

export const turnstileRefStore =
  atom<RefObject<TurnstileInstance | null> | null>(null);

export const editorRefStore = atom<RefObject<ReactCodeMirrorRef | null> | null>(
  null,
);
export const editorFontSizeStore = atomWithStorage<number>("fontSize", 13);
export const editorErrorStore = atomWithStorage<
  {
    line: number;
    msg: string;
    severity?: "error" | "warning" | "info";
  }[]
>("editorErrors", []);

export const codeStore = atomWithStorage<string>(
  "code",
  `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello C++ Here";\n    return 0;\n}`,
);
export const cppVersionStore = atomWithStorage<string>("cppVersion", "c++17");
export const inputStore = atomWithStorage<string>("input", "");
export const outputStore = atomWithStorage<OutputCase[]>("output", []);
export const runModeStore = atomWithStorage<"single" | "all">(
  "runMode",
  "single",
);
export const runStatusStore = atom<"idle" | "building" | "running">("idle");
export const testCasesStore = atomWithStorage<TestCase[]>("testCases", [
  { id: "example-1", name: "Test Case 1", input: "Example input 1" },
  { id: "example-2", name: "Test Case 2", input: "Example input 2" },
  { id: "example-3", name: "Test Case 3", input: "Example input 3" },
]);
export const codeWorkersStore = atom<CodeWorker[]>([]);

export const verifyJwtStore = atom<string | null>(null);
export const alertDialogStore = atom<AlertDialogOptions | null>(null);
export const panelDrawerStore = atom<PanelDrawerView | null>(null);

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
