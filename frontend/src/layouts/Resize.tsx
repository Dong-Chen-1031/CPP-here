import React from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { InputPanel, TestCasePanel, OutputPanel } from "@/components/stdio";

import Editor from "@/components/Editor";

const LAYOUT = { editor: 70, output: 30 };

export function SplitViewEditor() {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={LAYOUT}
      className="max-w-full rounded-lg mb-4"
    >
      <ResizablePanel id="editor" defaultSize={LAYOUT.editor}>
        <div className="rounded-md overflow-hidden h-full ml-4 mr-2 bg-accent">
          <Editor className="w-full h-full" />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="output" defaultSize={LAYOUT.output}>
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize={22}>
            <InputPanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={36}>
            <TestCasePanel />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={42}>
            <OutputPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
