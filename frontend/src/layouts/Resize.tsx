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
import { alertStore, loadedCountStore, loadedStore } from "@/store/atom";
import { Spinner } from "@/components/ui/spinner";
import { AnimatePresence, motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";

const LAYOUT = { editor: 70, output: 30 };
const LAYOUT2 = { InputPanel: 22, TestCasePanel: 36, OutputPanel: 42 };

function LoadingPanel({
  children,
  className,
  // className2,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [Loaded, setLoaded] = useAtom(loadedStore);

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {!Loaded ? (
          <motion.div
            key="loading"
            className={cn("absolute inset-0 w-full h-full")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Skeleton className="w-full h-full"></Skeleton>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            // style={{ display: "contents" }}
            className={cn("absolute inset-0 w-full h-full")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
        <div className="rounded-md overflow-hidden h-full ml-4 mr-2">
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
            <LoadingPanel className="mr-4 ml-2 mt-0 mb-2 h-[calc(100%-8px)]">
              <InputPanel />
            </LoadingPanel>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="TestCasePanel"
            defaultSize={LAYOUT2.TestCasePanel}
          >
            <LoadingPanel className="mr-4 ml-2 my-2 h-[calc(100%-16px)]">
              <TestCasePanel />
            </LoadingPanel>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="OutputPanel" defaultSize={LAYOUT2.OutputPanel}>
            <LoadingPanel className="ml-2 mr-4 mt-2 h-[calc(100%-0.5rem)]">
              <OutputPanel />
            </LoadingPanel>
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
      className={cn(`max-w-full w-full h-full rounded-lg md:hidden`, className)}
    >
      <div className="rounded-md overflow-hidden h-full ml-2 mr-2 bg-accent">
        {children}
      </div>
    </div>
  );
}

function EditorLoader() {
  const { t } = useTranslation(["editor"]);
  return <Skeleton className="w-full h-full"></Skeleton>;
}

const Loading = React.forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
  }
>(({ children, className }, ref) => {
  return (
    <motion.div
      ref={ref}
      className={cn("w-full h-full", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
});
Loading.displayName = "Loading";

export function SplitViewEditor() {
  const isMobile = useIsMobile();
  const [, setAlert] = useAtom(alertStore);
  const [loaded] = useAtom(loadedStore);
  const [, setLoadedCount] = useAtom(loadedCountStore);

  useEffect(() => {
    setLoadedCount((c) => c + 1);
    // console.log("SplitViewEditor loaded");
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

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {loaded ? (
        !isMobile ? (
          <Loading key="computer" className="mb-4">
            <ComputerLayout>
              <Editor className="w-full h-full" />
            </ComputerLayout>
          </Loading>
        ) : (
          <Loading key="mobile" className="mb-2">
            <MobileLayout>
              <Editor className="w-full h-full" />
            </MobileLayout>
          </Loading>
        )
      ) : (
        <Loading key="mobileLoading" className="md:hidden h-full mb-2">
          <MobileLayout>
            <EditorLoader />
          </MobileLayout>
        </Loading>
      )}
      {!loaded && (
        <Loading key="computerLoading" className="hidden md:flex mb-4">
          <ComputerLayout>
            <EditorLoader />
          </ComputerLayout>
        </Loading>
      )}
    </AnimatePresence>
  );
}
