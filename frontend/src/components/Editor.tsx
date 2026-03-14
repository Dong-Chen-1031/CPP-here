import React, { useState, useCallback, useRef, useEffect } from "react";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
// import { oneDark } from "@codemirror/theme-one-dark";
import { vscodeDarkInit } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { cppKeywords } from "../config/cppKeywords";
import {
  codeStore,
  editorFontSizeStore,
  editorStore,
  runModeStore,
} from "@/store/atom";
import { getDefaultStore, useAtom } from "jotai";
import { Spinner } from "./ui/spinner";
import { handleRun, handleRunAll } from "@/api/run";
import { ButtonGroup } from "./ui/button-group";
import { Button } from "./ui/button";
import { MinusIcon, PlusIcon } from "lucide-react";

type CppEditorProps = Omit<ReactCodeMirrorProps, "value" | "onChange"> & {
  defaultValue?: string;
  onChange?: (value: string) => void;
};

function cppCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: cppKeywords,
  };
}

function CppEditor({
  onChange,
  extensions = [],
  basicSetup,
  className,
  style,
  ...rest
}: CppEditorProps) {
  const [, setEditorGlobal] = useAtom(editorStore);
  const [code, setCode] = useAtom(codeStore);
  const [fontSize, setFontSize] = useAtom(editorFontSizeStore);
  const editorRef = useRef<
    import("@uiw/react-codemirror").ReactCodeMirrorRef | null
  >(null);

  const [isEditorReady, setIsEditorReady] = useState(false);

  useEffect(() => {
    return () => {
      setEditorGlobal(null);
    };
  }, []);

  const defaultStore = getDefaultStore();
  useEffect(() => {
    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const runMode = defaultStore.get(runModeStore);
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        if (runMode === "single") {
          handleRun();
        } else if (runMode === "all") {
          handleRunAll();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDownCapture, { capture: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDownCapture, {
        capture: true,
      });
      window.removeEventListener("keydown", handleKeyDown, {});
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setCode(value);
      onChange?.(value);
    },
    [onChange],
  );

  return (
    <div className="relative h-full">
      <div className="absolute bottom-5 right-5 z-1">
        <ButtonGroup
          orientation="horizontal"
          aria-label="Media controls"
          className="h-fit"
        >
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFontSize((p) => Math.max(p - 1, 5))}
            disabled={fontSize <= 5}
          >
            <MinusIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="bg-input/30! cursor-default"
          >
            {fontSize}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setFontSize((p) => Math.min(p + 1, 50))}
            disabled={fontSize >= 50}
          >
            <PlusIcon />
          </Button>
        </ButtonGroup>
      </div>
      <div
        className={
          "w-full h-full flex flex-col gap-4 items-center justify-center top-0 left-0 pointer-events-none" +
          (isEditorReady ? " hidden" : "")
        }
      >
        <p>Loading Editor</p>
        <Spinner className="size-9" />
      </div>

      <CodeMirror
        className={className}
        style={style}
        value={code}
        height="100%"
        theme={vscodeDarkInit({
          settings: {
            fontSize: `${fontSize}px`,
            background: "#1F1F1F",
            gutterBackground: "#1F1F1F",
          },
        })}
        ref={editorRef}
        onCreateEditor={() => {
          setEditorGlobal(editorRef);
          setIsEditorReady(true);
        }}
        extensions={[
          cpp(),
          autocompletion({ override: [cppCompletions] }),
          EditorView.lineWrapping,
          ...extensions,
        ]}
        onChange={handleChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          ...(typeof basicSetup === "object" ? basicSetup : {}),
        }}
        {...rest}
      />
    </div>
  );
}

export default CppEditor;
