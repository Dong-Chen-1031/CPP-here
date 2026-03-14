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
  editorStore,
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

export function UndoRedo({ menu = false }: { menu?: boolean }) {
  const [editorGlobal] = useAtom(editorStore);

  return (
    <TooltipProvider delayDuration={300}>
      <ButtonGroup>
        <Tip
          content={
            <>
              Undo <Kbd>{commandKey}</Kbd>
              <Kbd>Z</Kbd>
            </>
          }
          show={!menu}
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
            <UndoIcon />
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
          show={!menu}
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
            <RedoIcon />
            {/* {menu && <span>Redo</span>} */}
          </Button>
        </Tip>
      </ButtonGroup>
    </TooltipProvider>
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
  const [, openPanel] = useAtom(panelDrawerStore);
  const isMobile = useIsMobile();

  return (
    <TooltipProvider delayDuration={300}>
      <ButtonGroup className={className}>
        {!jwt ? (
          <Button variant="outline" disabled>
            <Spinner className="size-3" />
            <span className="text-xs">Verifying</span>
          </Button>
        ) : runStatus === "building" ? (
          <Button variant="outline" disabled>
            <Spinner className="size-3" />
            <span className="text-xs">Building</span>
          </Button>
        ) : runStatus === "running" ? (
          <Button variant="outline" disabled>
            <Spinner className="size-3" />
            <span className="text-xs">Running</span>
          </Button>
        ) : runMode === "single" ? (
          <Tip
            content={
              <>
                Run Code <Kbd>{commandKey}</Kbd>
                <Kbd>⏎</Kbd>
              </>
            }
          >
            <Button
              variant="outline"
              onClick={(e) => {
                handleRun();
                onClick(e);
                isMobile && openPanel("output");
              }}
            >
              <Play />
              Run
            </Button>
          </Tip>
        ) : (
          <Tip
            content={
              <>
                Run all test cases <Kbd>{commandKey}</Kbd>
                <Kbd>⏎</Kbd>
              </>
            }
          >
            <Button
              variant="outline"
              onClick={(e) => {
                handleRunAll();
                onClick(e);
                isMobile && openPanel("output");
              }}
            >
              <TestTubes />
              Run All
            </Button>
          </Tip>
        )}
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
                    isMobile && openPanel("output");
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
                    isMobile && openPanel("output");
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
    </TooltipProvider>
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
    <TooltipProvider delayDuration={300}>
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
    </TooltipProvider>
  );
}
