import { atom } from "jotai";
import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";

export const editorStore = atom<RefObject<ReactCodeMirrorRef | null> | null>(
  null,
);
export const codeStore = atom<string>("");
export const cppVersionStore = atom<string>("c++17");
