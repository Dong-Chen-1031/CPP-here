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
  codeStore,
  cppVersionStore,
  editorStore,
  inputStore,
  outputStore,
  runModeStore,
  testCasesStore,
  type OutputLine,
} from "@/store/atom";

import { undo, redo } from "@codemirror/commands";

import { buildCode, runCode } from "@/api/run";

import Tip from "@/components/ui/tips";
import { useResetAllAtoms } from "@/store/atom";
import { set } from "astro:schema";

export default function HeaderActions() {
  const [editorGlobal] = useAtom(editorStore);
  const [cppVersion, setCppVersion] = useAtom(cppVersionStore);
  const [code] = useAtom(codeStore);
  const [input] = useAtom(inputStore);
  const [, setOutput] = useAtom(outputStore);
  const [testCases] = useAtom(testCasesStore);
  const [runMode, setRunMode] = useAtom(runModeStore);
  const [runStatus, setRunStatus] = React.useState<
    "idle" | "building" | "running"
  >("idle");
  const exitCountRef = React.useRef(0);
  const resetAll = useResetAllAtoms();

  async function handleRun() {
    setRunStatus("building");
    const response = await buildCode(code, cppVersion);
    if (!response.ok) {
      setOutput([
        {
          type: "err",
          content: "Build failed with errors:\n" + response.errors[0],
        },
      ]);
      setRunStatus("idle");
      return;
    }
    runCode(response.js_code, response.wasm_url, input, {
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
      },
      onExit() {
        setRunStatus("idle");
      },
    });
    setRunStatus("running");
  }

  async function handleRunAll() {
    setRunStatus("building");
    const response = await buildCode(code, cppVersion);
    if (!response.ok) {
      setOutput([
        {
          type: "err",
          content: "Build failed with errors:\n" + response.errors[0],
        },
      ]);
      setRunStatus("idle");
      return;
    }

    setOutput([]);
    exitCountRef.current = 0;

    const orderedIds = testCases.map((tc) => tc.id);

    function insertInOrder(prev: OutputLine[], item: OutputLine) {
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

    for (const testCase of testCases) {
      runCode(response.js_code, response.wasm_url, testCase.input, {
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
      <div className="flex items-center space-x-2">
        <ButtonGroup className="hidden sm:flex">
          <Tip label="Undo (ctrl+z)">
            <Button
              variant="outline"
              size="icon-sm"
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
            </Button>
          </Tip>
          <Tip label="Redo (ctrl+shift+z)">
            <Button
              variant="outline"
              size="icon-sm"
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
            </Button>
          </Tip>
        </ButtonGroup>
        <ButtonGroup>
          <Tip label="Reset Everything">
            <Button variant="outline" onClick={resetAll}>
              <RotateCcw />
              Reset
            </Button>
          </Tip>
        </ButtonGroup>
        {/* <Tip label="C++ Version"> */}
        <Select value={cppVersion} onValueChange={setCppVersion}>
          <SelectTrigger className="w-full max-w-48" size="sm">
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
        {/* </Tip> */}

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
        <ButtonGroup>
          {runStatus === "building" ? (
            <Button variant="outline" disabled>
              <Spinner />
              <span className="text-xs">Building</span>
            </Button>
          ) : runStatus === "running" ? (
            <Button variant="outline" disabled>
              <Spinner />
              <span className="text-xs">Running</span>
            </Button>
          ) : runMode === "single" ? (
            <Tip label="Run code">
              <Button variant="outline" onClick={handleRun}>
                <Play />
                Run
              </Button>
            </Tip>
          ) : (
            <Tip label="Run all test cases">
              <Button variant="outline" onClick={handleRunAll}>
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
                disabled={runStatus !== "idle"}
              >
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-fit">
              <DropdownMenuGroup>
                {runMode === "single" ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setRunMode("all");
                      handleRunAll();
                    }}
                  >
                    <TestTubes />
                    <Tip label="Run all test cases">
                      <p className="text-xs">Run All</p>
                    </Tip>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      setRunMode("single");
                      handleRun();
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
      </div>
    </TooltipProvider>
  );
}
