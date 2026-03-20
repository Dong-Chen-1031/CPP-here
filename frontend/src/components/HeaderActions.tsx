import * as React from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, RotateCcw, TestTubes } from "lucide-react";
import { Play, UndoIcon, RedoIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAtom } from "jotai";
import {
  cppVersionStore,
  editorRefStore,
  panelDrawerStore,
  runModeStore,
  runStatusStore,
  verifyJwtStore,
} from "@/store/atom";

import { undo, redo } from "@codemirror/commands";

import { handleRun, handleRunAll } from "@/api/run";

import Tip from "@/components/ui/tips";
import { useResetAllAtoms } from "@/store/atom";
import { cn, commandKey, useIsMobile } from "@/lib/utils";
import { Kbd } from "./ui/kbd";
import { AnimatePresence, motion } from "motion/react";

export function UndoRedo({ menu = false }: { menu?: boolean }) {
  const [editorGlobal] = useAtom(editorRefStore);

  return (
    <ButtonGroup>
      <Tip
        content={
          <>
            Undo <Kbd>{commandKey}</Kbd>
            <Kbd>Z</Kbd>
          </>
        }
      >
        <Button
          variant="outline"
          size={menu ? "sm" : "icon-sm"}
          aria-label="Undo"
          onClick={() => {
            if (editorGlobal?.current?.view) {
              undo(editorGlobal.current.view);
            } else {
              console.warn("Editor view is not available for undo.");
            }
          }}
        >
          <motion.div
            whileTap={{ rotate: -30 }}
            className="w-full h-full flex items-center justify-center"
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <UndoIcon />
          </motion.div>
          {/* {menu && <span>Undo</span>} */}
        </Button>
      </Tip>
      <Tip
        content={
          <>
            Redo <Kbd>{commandKey}</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>Z</Kbd>
          </>
        }
      >
        <Button
          variant="outline"
          size={menu ? "sm" : "icon-sm"}
          aria-label="Redo"
          onClick={() => {
            if (editorGlobal?.current?.view) {
              redo(editorGlobal.current.view);
            } else {
              console.warn("Editor view is not available for redo.");
            }
          }}
        >
          <motion.div
            whileTap={{ rotate: 30 }}
            className="w-full h-full flex items-center justify-center"
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <RedoIcon />
          </motion.div>
          {/* {menu && <span>Redo</span>} */}
        </Button>
      </Tip>
    </ButtonGroup>
  );
}

function MotionButtonLabel({
  children,
  lastWidthRef,
  initial = true,
}: {
  children: React.ReactNode;
  lastWidthRef: React.RefObject<number>;
  initial?: boolean;
}) {
  const initialW = lastWidthRef.current;
  const [currentW, setCurrentW] = React.useState(initialW);

  React.useLayoutEffect(() => {
    const el = document.getElementById("runBtnText");
    if (el) {
      const len = el.innerText.length;
      setCurrentW(len);
      lastWidthRef.current = len;
    }
  }, [lastWidthRef]);

  return (
    <motion.div
      initial={
        initial && {
          width: `calc(${initialW}ch + 1.125rem)`,
          opacity: 0,
        }
      }
      animate={{ width: "auto", opacity: 1 }}
      // exit={{ opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
      className="w-full h-full flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap opacity-0"
    >
      {children}
    </motion.div>
  );
}

export function RunButton({
  className = "",
  onClick = () => {},
}: {
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [runMode, setRunMode] = useAtom(runModeStore);
  const [jwt] = useAtom(verifyJwtStore);

  const [runStatus] = useAtom(runStatusStore);
  const lastWidthRef = React.useRef(8.2);
  const isMobile = useIsMobile();
  const btnTextRef = React.useRef<HTMLSpanElement>(null);
  const cantPress = !jwt || runStatus !== "idle";

  return (
    <ButtonGroup className={className}>
      <Tip
        show={!cantPress}
        content={
          runMode === "single" ? (
            <>
              Run Code <Kbd>{commandKey}</Kbd>
              <Kbd>⏎</Kbd>
            </>
          ) : (
            <>
              Run all test cases <Kbd>{commandKey}</Kbd>
              <Kbd>⏎</Kbd>
            </>
          )
        }
      >
        <Button
          variant="outline"
          className="overflow-hidden"
          // style={{ maxWidth: `${buttonMaxWidth}rem` }}
          disabled={cantPress}
          onClick={(e) => {
            if (cantPress) return;
            if (runMode === "single") {
              handleRun();
            } else {
              handleRunAll();
            }
            onClick(e);
          }}
        >
          <AnimatePresence mode="popLayout">
            {!jwt ? (
              <MotionButtonLabel
                key="verify"
                lastWidthRef={lastWidthRef}
                initial={false}
              >
                <Spinner className="size-3" />
                <span className="text-xs" id="runBtnText" ref={btnTextRef}>
                  Verifying
                </span>
              </MotionButtonLabel>
            ) : runStatus === "building" ? (
              <MotionButtonLabel key="building" lastWidthRef={lastWidthRef}>
                <Spinner className="size-3" />
                <span className="text-xs" id="runBtnText" ref={btnTextRef}>
                  Building
                </span>
              </MotionButtonLabel>
            ) : runStatus === "running" ? (
              <MotionButtonLabel key="running" lastWidthRef={lastWidthRef}>
                <Spinner className="size-3" />
                <span className="text-xs" id="runBtnText" ref={btnTextRef}>
                  Running
                </span>
              </MotionButtonLabel>
            ) : runMode === "single" ? (
              <MotionButtonLabel key="run" lastWidthRef={lastWidthRef}>
                <Play />
                <span id="runBtnText" ref={btnTextRef}>
                  Run
                </span>
              </MotionButtonLabel>
            ) : (
              <MotionButtonLabel key="run-all" lastWidthRef={lastWidthRef}>
                <TestTubes />
                <span id="runBtnText" ref={btnTextRef}>
                  Run All
                </span>
              </MotionButtonLabel>
            )}
          </AnimatePresence>
        </Button>
      </Tip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="p-1"
            disabled={runStatus !== "idle" || !jwt}
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-fit">
          <DropdownMenuGroup>
            {runMode === "single" ? (
              <DropdownMenuItem
                onClick={(e) => {
                  setRunMode("all");
                  handleRunAll();
                  onClick(e);
                }}
              >
                <TestTubes />
                <Tip label="Run all test cases">
                  <p className="text-xs">Run All</p>
                </Tip>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={(e) => {
                  setRunMode("single");
                  handleRun();
                  onClick(e);
                }}
                className="w-27"
              >
                <Play />
                <Tip label="Run current input">
                  <p className="text-xs flex-1">Run</p>
                </Tip>
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* <Button variant="outline">Run in interactive</Button> */}
    </ButtonGroup>
  );
}

export function ResetButton({
  className = "",
  onClick = () => {},
}: {
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const resetAll = useResetAllAtoms();

  return (
    <ButtonGroup>
      <Tip label="Reset Everything">
        <Button
          variant="outline"
          className={className}
          onClick={(e) => {
            resetAll();
            onClick(e);
          }}
        >
          <RotateCcw />
          Reset
        </Button>
      </Tip>
    </ButtonGroup>
  );
}

export function CppVersionSelect({
  onSelect,
  className = "",
}: {
  onSelect?: (version: string) => void;
  className?: string;
}) {
  const [cppVersion, setCppVersion] = useAtom(cppVersionStore);

  return (
    <Select
      value={cppVersion || "c++17"}
      onValueChange={(version) => {
        setCppVersion(version);
        onSelect?.(version);
      }}
    >
      <SelectTrigger className={cn("w-full max-w-48", className)} size="sm">
        <SelectValue placeholder="C++ Version" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          <SelectLabel>C++ Version</SelectLabel>
          <SelectItem value="c++98">C++ 98</SelectItem>
          <SelectItem value="c++14">C++ 14</SelectItem>
          <SelectItem value="c++17">C++ 17</SelectItem>
          <SelectItem value="c++20">C++ 20</SelectItem>
          <SelectItem value="c++23">C++ 23</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export default function HeaderActions() {
  return (
    <div className="flex items-center space-x-2">
      <UndoRedo />
      <ResetButton />
      <CppVersionSelect />
      <RunButton />

      {/* <ButtonGroup>
        <Button variant="outline">
          <Download />
          Download
        </Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="outline">
          <Upload />
          Upload
        </Button>
      </ButtonGroup> */}
      {/* <ButtonGroup>
          <Tip label="Share Code">
            <Button variant="outline">
              <Share2 />
              Share
            </Button>
          </Tip>
        </ButtonGroup> */}
    </div>
  );
}
