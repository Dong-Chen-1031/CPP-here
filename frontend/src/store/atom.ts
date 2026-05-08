import { atom } from "jotai";
import { atomWithStorage, RESET, useResetAtom } from "jotai/utils";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import type { CodeWorker } from "@/api/run";
import type { AlertDialogOptions } from "@/components/Alert";
import type { EditDialogOptions } from "@/components/panel/TestEditDialog";
import { defCodeStore } from "./configStore";
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
export const editorErrorStore = atomWithStorage<
    {
        line: number;
        msg: string;
        severity?: "error" | "warning" | "info";
    }[]
>("editorErrors", []);

const baseCodeAtom = atomWithStorage<string | null>("code", null);
export const codeStore = atom(
    (get) => get(baseCodeAtom) ?? get(defCodeStore),
    (get, set, update: string | typeof RESET | ((prev: string) => string)) => {
        if (update === RESET) {
            set(baseCodeAtom, RESET);
        } else {
            const nextValue =
                typeof update === "function"
                    ? update(get(baseCodeAtom) ?? get(defCodeStore))
                    : update;
            set(baseCodeAtom, nextValue);
        }
    },
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
export const testCaseEditStore = atom<EditDialogOptions | null>(null);
export const settingsPanelStore = atom(false);

export function useResetEditorAtoms() {
    const resetCode = useResetAtom(codeStore);
    const resetCppVersion = useResetAtom(cppVersionStore);
    const resetInput = useResetAtom(inputStore);
    const resetOutput = useResetAtom(outputStore);
    const resetRunMode = useResetAtom(runModeStore);
    const resetTestCases = useResetAtom(testCasesStore);
    const resetEditorErrors = useResetAtom(editorErrorStore);

    return () => {
        resetCode();
        resetCppVersion();
        resetInput();
        resetOutput();
        resetRunMode();
        resetTestCases();
        resetEditorErrors();
    };
}
