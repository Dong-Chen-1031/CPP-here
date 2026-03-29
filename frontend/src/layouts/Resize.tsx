import "../lib/i18n";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import { InputPanel, TestCasePanel, OutputPanel } from "@/components/stdio";

import Editor from "@/components/Editor";
import { cn, useIsMobile } from "@/lib/utils";
import { useAtom } from "jotai";
import { alertStore } from "@/store/atom";
import { Spinner } from "@/components/ui/spinner";

const LAYOUT = { editor: 70, output: 30 };
const LAYOUT2 = { InputPanel: 22, TestCasePanel: 36, OutputPanel: 42 };

function ComputerLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      defaultLayout={LAYOUT}
      className={cn("max-w-full mb-4 hidden! md:flex!", className)}
    >
      <ResizablePanel id="editor" defaultSize={LAYOUT.editor}>
        <div className="rounded-md overflow-hidden h-full ml-4 mr-2 bg-accent">
          {children}
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
  );
}

function MobileLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        `max-w-full w-full h-full rounded-lg mb-2 md:hidden `,
        className,
      )}
    >
      <div className="rounded-md overflow-hidden h-full ml-2 mr-2 bg-accent">
        {children}
      </div>
    </div>
  );
}

function EditorLoader() {
  const { t } = useTranslation(["editor"]);
  return (
    <div
      className={
        "w-full h-full flex flex-col gap-4 items-center justify-center top-0 left-0 pointer-events-none"
      }
    >
      <p>{t("resize.loadingEditor")}</p>
      <Spinner className="size-9" />
    </div>
  );
}

export function SplitViewEditor() {
  const isMobile = useIsMobile();
  const [alerts, setAlert] = useAtom(alertStore);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(true);
    console.log("SplitViewEditor loaded");
    if (document.location.origin === "https://cpp-here.pages.dev") {
      setAlert((p) => [
        ...p,
        {
          title: "We have moved!",
          description: "Please use the new url cpp.doong.me",
          variant: "default",
          id: crypto.randomUUID(),
        },
      ]);
    }
  }, []);

  return loaded ? (
    !isMobile ? (
      <ComputerLayout>
        <Editor className="w-full h-full" />
      </ComputerLayout>
    ) : (
      <MobileLayout>
        <Editor className="w-full h-full" />
      </MobileLayout>
    )
  ) : (
    <>
      <MobileLayout className="md:hidden">
        <EditorLoader />
      </MobileLayout>
      <ComputerLayout className="hidden md:flex">
        <EditorLoader />
      </ComputerLayout>
    </>
  );
}
