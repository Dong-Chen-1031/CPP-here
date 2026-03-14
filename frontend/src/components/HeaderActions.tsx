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
  alertStore,
  codeStore,
  cppVersionStore,
  editorStore,
  inputStore,
  outputStore,
  panelDrawerStore,
  runModeStore,
  runStatusStore,
  testCasesStore,
  verifyJwtStore,
  type OutputCase,
} from "@/store/atom";

import { undo, redo } from "@codemirror/commands";

import { buildCode, runCode, url2WasmModule } from "@/api/run";

import Tip from "@/components/ui/tips";
import { useResetAllAtoms } from "@/store/atom";
import { cn, useIsMobile } from "@/lib/utils";

export function UndoRedo({ menu = false }: { menu?: boolean }) {
  const [editorGlobal] = useAtom(editorStore);

  return (
    <TooltipProvider delayDuration={300}>
      <ButtonGroup>
        <Tip label="Undo (ctrl+z)" show={!menu}>
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
        <Tip label="Redo (ctrl+shift+z)" show={!menu}>
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
  const [code] = useAtom(codeStore);
  const [input] = useAtom(inputStore);
  const [, setOutput] = useAtom(outputStore);
  const [cppVersion] = useAtom(cppVersionStore);

  const [testCases] = useAtom(testCasesStore);

  const [runStatus, setRunStatus] = useAtom(runStatusStore);
  const [, setAlert] = useAtom(alertStore);
  const [, openPanel] = useAtom(panelDrawerStore);
  const isMobile = useIsMobile();
  const exitCountRef = React.useRef(0);
  async function handleRun() {
    setRunStatus("building");

    const response = await buildCode(code, cppVersion);

    if (!response.ok || !response.js_code) {
      setOutput([
        {
          type: "err",
          content: "Build failed with errors:\n" + response.errors[0],
        },
      ]);
      setAlert((p) => [
        ...p,
        {
          title: "Build Failed",
          description:
            "Failed to build the code. Please check output for details.",
          variant: "destructive",
          id: crypto.randomUUID(),
        },
      ]);

      setRunStatus("idle");
      return;
    }

    runCode(response.js_code, input, {
      wasmUrl: response.wasm_url,
      onInit: () => {
        setOutput([]);
      },
      onStdout: (output) => {
        setOutput((prev) => [
          { content: (prev[prev.length - 1]?.content || "") + output + "\n" },
        ]);
      },
      onError(error) {
        setOutput((prev) => [...prev, { type: "err", content: error }]);
        setAlert((p) => [
          ...p,
          {
            title: "Runtime Error",
            description:
              "An error occurred during code execution. Please check output for details.",
            variant: "destructive",
            id: crypto.randomUUID(),
          },
        ]);
      },
      onExit() {
        setRunStatus("idle");
      },
    });
    setRunStatus("running");
  }

  const orderedIds = testCases.map((tc) => tc.id);

  function insertInOrder(prev: OutputCase[], item: OutputCase) {
    const lastSameIdx = prev.findLastIndex(
      (o) => o.testCaseId === item.testCaseId && o.type === item.type,
    );
    if (lastSameIdx !== -1) {
      const merged = {
        ...prev[lastSameIdx],
        content: prev[lastSameIdx].content + "\n" + item.content,
      };
      return [
        ...prev.slice(0, lastSameIdx),
        merged,
        ...prev.slice(lastSameIdx + 1),
      ];
    }

    const insertIdx = orderedIds.indexOf(item.testCaseId!);
    let pos = prev.length;
    for (let i = prev.length - 1; i >= 0; i--) {
      const idx = orderedIds.indexOf(prev[i].testCaseId!);
      if (idx <= insertIdx) {
        pos = i + 1;
        break;
      }
      pos = i;
    }
    return [...prev.slice(0, pos), item, ...prev.slice(pos)];
  }
  async function handleRunAll() {
    if (testCases.length === 0) {
      setAlert((p) => [
        ...p,
        {
          title: "No Test Cases",
          description:
            "There are no test cases to run. Please add some test cases first.",
          variant: "destructive",
          id: crypto.randomUUID(),
        },
      ]);
      return;
    }
    setRunStatus("building");
    const response = await buildCode(code, cppVersion);
    if (!response.ok || !response.js_code || !response.wasm_url) {
      setOutput([
        {
          type: "err",
          content: "Build failed with errors:\n" + response.errors[0],
        },
      ]);
      setAlert((p) => [
        ...p,
        {
          title: "Build Failed",
          description:
            "Failed to build the code. Please check output for details.",
          variant: "destructive",
          id: crypto.randomUUID(),
        },
      ]);
      setRunStatus("idle");
      return;
    }
    const wasmModule = await url2WasmModule(response.wasm_url);
    setOutput([]);
    exitCountRef.current = 0;

    for (const testCase of testCases) {
      runCode(response.js_code, testCase.input, {
        wasmModule: wasmModule,
        onStdout(output) {
          setOutput((prev) =>
            insertInOrder(prev, {
              content: output,
              testCaseId: testCase.id,
              testCaseName: testCase.name,
            }),
          );
        },
        onError(error) {
          setOutput((prev) =>
            insertInOrder(prev, {
              type: "err",
              content: error,
              testCaseId: testCase.id,
              testCaseName: testCase.name,
            }),
          );
          setAlert((p) => [
            ...p,
            {
              title: `Runtime Error in ${testCase.name}`,
              description:
                "An error occurred during code execution. Please check output for details.",
              variant: "destructive",
              id: crypto.randomUUID(),
            },
          ]);
        },
        onExit() {
          exitCountRef.current += 1;
          console.log(
            `Test case ${testCase.name} completed. (${exitCountRef.current}/${testCases.length})`,
          );
          if (exitCountRef.current === testCases.length) {
            setRunStatus("idle");
          }
        },
      });
    }
    setRunStatus("running");
  }

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
          <Tip label="Run code">
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
          <Tip label="Run all test cases">
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
