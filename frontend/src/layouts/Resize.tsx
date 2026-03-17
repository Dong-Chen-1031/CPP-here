import React, { useEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { InputPanel, TestCasePanel, OutputPanel } from "@/components/stdio";

import Editor from "@/components/Editor";
import { useIsMobile } from "@/lib/utils";
import { useAtom } from "jotai";
import { alertStore } from "@/store/atom";

const LAYOUT = { editor: 70, output: 30 };
const LAYOUT2 = { InputPanel: 22, TestCasePanel: 36, OutputPanel: 42 };

export function SplitViewEditor() {
  const isMobile = useIsMobile();
  const [alerts, setAlert] = useAtom(alertStore);

  useEffect(() => {
    if (document.location.origin === "https://cpp-here.pages.dev") {
      setAlert((p) => [
        ...p,
        {
          title: "This url has been deprecated",
          description:
            "cpp-here.pages.dev is no longer supported. Please use the new url cpp.doong.me",
          variant: "destructive",
          id: crypto.randomUUID(),
        },
      ]);
    }
  }, []);
  return (
    <>
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={LAYOUT}
        className="max-w-full mb-4 hidden! md:flex!"
      >
        <ResizablePanel id="editor" defaultSize={LAYOUT.editor}>
          <div className="rounded-md overflow-hidden h-full ml-4 mr-2 bg-accent">
            <Editor className="w-full h-full" />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle className="hidden md:flex" />
        <ResizablePanel
          id="output"
          className="hidden md:flex"
          defaultSize={LAYOUT.output}
        >
          <ResizablePanelGroup orientation="vertical" defaultLayout={LAYOUT2}>
            <ResizablePanel id="InputPanel" defaultSize={LAYOUT2.InputPanel}>
              <InputPanel />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="TestCasePanel"
              defaultSize={LAYOUT2.TestCasePanel}
            >
              <TestCasePanel />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="OutputPanel" defaultSize={LAYOUT2.OutputPanel}>
              <OutputPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
      <div className="max-w-full w-full h-full rounded-lg mb-2 md:hidden">
        <div className="rounded-md overflow-hidden h-full ml-2 mr-2 bg-accent">
          <Editor className="w-full h-full" />
        </div>
      </div>
    </>
  );
}
