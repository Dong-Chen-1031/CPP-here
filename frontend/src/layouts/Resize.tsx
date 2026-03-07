import React from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import StdIO from "@/components/stdio";

import Editor from "@/components/Editor";

const LAYOUT = { editor: 70, output: 30 };

export function SplitViewEditor() {
  const stdios = StdIO();
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
          {stdios.map((stdio, index) => (
            <React.Fragment key={index}>
              {index > 0 && <ResizableHandle withHandle />}
              <ResizablePanel defaultSize={100 / stdios.length}>
                {stdio}
              </ResizablePanel>
            </React.Fragment>
          ))}

          {/* <ResizablePanel defaultSize="25%">
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Two</span>
            </div>
          </ResizablePanel>
           */}
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
