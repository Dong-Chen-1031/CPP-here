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
import { ChevronDownIcon, TestTubes } from "lucide-react";
import { Play, UndoIcon, RedoIcon } from "lucide-react";
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
  testCasesStore,
} from "@/store/atom";

import { undo, redo } from "@codemirror/commands";

import { buildCode, runCode } from "@/api/run";

import Tip from "@/components/ui/tips";

export default function HeaderActions() {
  const [editorGlobal] = useAtom(editorStore);
  const [cppVersion, setCppVersion] = useAtom(cppVersionStore);
  const [code] = useAtom(codeStore);
  const [input] = useAtom(inputStore);
  const [, setOutput] = useAtom(outputStore);
  const [testCases] = useAtom(testCasesStore);
  const [runMode, setRunMode] = React.useState<"single" | "all">("single");

  async function handleRun() {
    const response = await buildCode(code, cppVersion);
    if (!response.ok) {
      setOutput("[err]Build failed with errors:\n" + response.errors[0]);
      return;
    }
    runCode(response.js_code, response.wasm_url, input, {
      onInit: () => {
        setOutput("");
      },
      onStdout: (output) => {
        setOutput((prev) => prev + output);
      },
      onError(error) {
        setOutput((prev) => prev + "[err]" + error);
      },
    });
  }

  async function handleRunAll() {
    const response = await buildCode(code, cppVersion);
    if (!response.ok) {
      setOutput("[err]Build failed with errors:\n" + response.errors[0]);
      return;
    }

    setOutput("");
    for (const testCase of testCases) {
      runCode(response.js_code, response.wasm_url, testCase.input, {
        onStdout: (output) => {
          setOutput((prev) => prev + output);
        },
        onError(error) {
          setOutput((prev) => prev + "[err]" + error);
        },
      });
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center space-x-2">
        <ButtonGroup className="hidden sm:flex">
          <Tip label="Undo (ctrl+z)">
            <Button
              variant="outline"
              size="icon"
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
              size="icon"
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
        {/* <Tip label="C++ Version"> */}
        <Select value={cppVersion} onValueChange={setCppVersion}>
          <SelectTrigger className="w-full max-w-48">
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
          <Tip label="Format code">
            <Button variant="outline">
              <Form />
              Format
            </Button>
          </Tip>
        </ButtonGroup> */}
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
          {runMode === "single" ? (
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
              <Button variant="outline" className="p-1">
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-fit">
              <DropdownMenuGroup>
                {runMode === "single" ? (
                  <DropdownMenuItem onClick={() => setRunMode("all")}>
                    <TestTubes />
                    <Tip label="Run all test cases">
                      <p className="text-xs">Run All</p>
                    </Tip>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => setRunMode("single")}
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
