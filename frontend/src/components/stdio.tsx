import { Button } from "@/components/ui/button";
import {
  ClipboardPaste,
  CirclePlus,
  Keyboard,
  TestTubes,
  Trash,
  Pencil,
  SquareTerminal,
  ClipboardCopy,
  Play,
  CircleCheckBig,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import React, { useRef } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Tip from "./ui/tips";
import { TooltipProvider } from "./ui/tooltip";
import { useAtom } from "jotai";
import {
  inputStore,
  outputStore,
  panelDrawerStore,
  runStatusStore,
  testCasesStore,
  type TestCase,
} from "@/store/atom";
import { cn, useIsMobile } from "@/lib/utils";
import { handleRun } from "@/api/run";
import { AnimatePresence, motion } from "motion/react";
import IconMotion from "./IconMotion";
import { Spinner } from "./ui/spinner";
interface EditDialogOptions {
  title?: string;
  name?: string;
  input?: string;
  submitBtnName?: string;
  tips?: string;
  handleSubmit?: (name: string, input: string) => void;
}

export function TestEditDialog({
  trigger,
  title = "New Test Case",
  name = "Test Case 1",
  input = "",
  tips = "",
  submitBtnName = "Create",
  handleSubmit = (n, i) => {
    console.log(n, i);
  },
}: EditDialogOptions & { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const caseNameRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmitWrapper() {
    const name = caseNameRef.current?.value || "";
    const input = inputRef.current?.value || "";
    handleSubmit(name, input);
    setOpen(false);
  }

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSubmitWrapper();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tips ? (
        <Tip label={tips}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        </Tip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent
        className="md:max-w-125"
        showCloseButton={false}
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader className="p-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FieldGroup className="p-2">
          <Field>
            <Label htmlFor="name-1">Case Name</Label>
            <Input
              id="name-1"
              name="name"
              defaultValue={name}
              ref={caseNameRef}
              onFocus={(e) => {
                window.innerWidth > 768 && e.target.select();
              }}
            />
          </Field>
          <Field>
            <Label htmlFor="username-1">Input</Label>
            <Textarea
              className="h-50"
              name="input"
              placeholder="Type your input here."
              defaultValue={input}
              autoFocus
              onFocus={(e) => {
                window.innerWidth > 768 && e.target.select();
              }}
              ref={inputRef}
            />
          </Field>
        </FieldGroup>

        <DialogFooter className="border-t-border p-4">
          <Tip
            content={
              <>
                Cancel <Kbd>Esc</Kbd>
              </>
            }
          >
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          </Tip>

          <Tip
            content={
              <>
                Submit{" "}
                {navigator.platform.includes("Mac") ? (
                  <Kbd>⌘</Kbd>
                ) : (
                  <Kbd>Ctrl</Kbd>
                )}
                {""}
                <Kbd>⏎</Kbd>
              </>
            }
          >
            <Button onClick={handleSubmitWrapper}>{submitBtnName}</Button>
          </Tip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InputPanel({ drawer = false }: { drawer?: boolean }) {
  const [input, setInput] = useAtom(inputStore);
  const [pasted, setPasted] = React.useState(false);
  const [cleared, setCleared] = React.useState(false);
  return (
    <div
      className={cn(
        "p-4 border-border border-2 rounded-md mr-4 ml-2 mt-0 mb-2 h-[calc(100%-8px)] @container",
        drawer && "mr-2",
      )}
    >
      <div className="flex gap-2 items-center">
        <Keyboard className="w-3 h-3 shrink-0" />
        <p className="text-sm truncate">Input</p>
        <div className="flex-1"></div>

        <Tip label="Paste from clipboard">
          <Button
            variant="outline"
            onClick={async () => {
              setInput(await navigator.clipboard.readText());
              setPasted(true);
              setTimeout(() => setPasted(false), 1500);
            }}
            className="px-2"
          >
            <IconMotion show={pasted} HideIcon={ClipboardPaste} />
            <span className="hidden @[250px]:inline">Paste</span>
          </Button>
        </Tip>
        <Tip label="Clear input">
          <Button
            variant="outline"
            onClick={() => {
              setInput("");
              setCleared(true);
              setTimeout(() => setCleared(false), 1500);
            }}
            disabled={input.length === 0}
            className="px-2"
          >
            <IconMotion show={cleared} HideIcon={Trash} />
            <span className="hidden @[250px]:inline">Clear</span>
          </Button>
        </Tip>
      </div>
      <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)]">
        <Textarea
          className="text-xs!"
          placeholder="Type your input here."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onFocus={(e) => window.innerWidth > 768 && e.target.select()}
        />
      </div>
    </div>
  );
}

export function TestCasePanel({ drawer = false }: { drawer?: boolean }) {
  const [, setInput] = useAtom(inputStore);
  const [testCases, setTestCases] = useAtom(testCasesStore);
  const [, setPanel] = useAtom(panelDrawerStore);
  const isMobile = useIsMobile();

  function handleAddTestCase(name: string, input: string) {
    const newTestCase: TestCase = {
      id: crypto.randomUUID(),
      name,
      input,
    };
    setTestCases((prev) => [...prev, newTestCase]);
  }

  return (
    <div
      className={cn(
        "p-4 border-border border-2 rounded-md mr-4 ml-2 my-2 h-[calc(100%-16px)] @container",
        drawer && "mr-2",
      )}
    >
      <div className="flex gap-2 items-center">
        <TestTubes className="w-3 h-3 shrink-0" />
        <p className="text-sm truncate">Test Case</p>
        <div className="flex-1"></div>
        <TestEditDialog
          tips="Add new test case"
          trigger={
            <Button variant="outline" className="px-2">
              <CirclePlus className="w-4 h-4" />
              <span className="hidden @[250px]:inline">New</span>
            </Button>
          }
          name={`test Case ${testCases.length + 1}`}
          handleSubmit={handleAddTestCase}
        />
      </div>
      <div className="mt-4 overflow-y-auto max-h-[calc(100%-2rem)]">
        {testCases.length === 0 ? (
          <p className="text-sm text-muted-foreground pl-2">
            No test cases yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {testCases.map((testCase) => (
              <div
                key={testCase.id}
                className="text-sm bg-accent/75 p-2 rounded-md cursor-pointer hover:bg-accent flex items-center justify-between gap-2"
                onClick={() => {
                  setInput(testCase.input);
                  isMobile && setPanel("input");
                }}
              >
                <Tip label="Set Input to this Test Case">
                  <p className="flex-1 truncate">{testCase.name}</p>
                </Tip>
                <Tip label="Run this Test Case">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRun({ input: testCase.input });
                    }}
                  >
                    <Play className="w-4 h-4" />
                  </Button>
                </Tip>
                <TestEditDialog
                  trigger={
                    <Button variant="outline" size="icon">
                      <Pencil className="w-4 h-4" />
                    </Button>
                  }
                  tips="Edit test case"
                  title="Edit Test Case"
                  name={testCase.name}
                  input={testCase.input}
                  submitBtnName="Save"
                  handleSubmit={(name, input) => {
                    setTestCases((prev) =>
                      prev.map((tc) =>
                        tc.id === testCase.id ? { ...tc, name, input } : tc,
                      ),
                    );
                  }}
                />
                <Tip label="Delete Test Case">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTestCases((prev) =>
                        prev.filter((tc) => tc.id !== testCase.id),
                      );
                    }}
                  >
                    <Trash className="w-4 h-4" />
                  </Button>
                </Tip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function OutputPanel({ drawer = false }: { drawer?: boolean }) {
  const [output, setOutput] = useAtom(outputStore);
  const [copied, setCopied] = React.useState(false);
  const [cleared, setCleared] = React.useState(false);
  const [runStatus] = useAtom(runStatusStore);
  return (
    <div
      className={cn(
        "p-4 border-border border-2 rounded-md ml-2 mr-4 mt-2 h-[calc(100%-8px)] @container",
        drawer && "mr-2",
      )}
    >
      <div className="flex gap-2 items-center">
        <SquareTerminal className="w-3 h-3 shrink-0" />
        <p className="text-sm truncate">Output</p>
        <div className="flex-1"></div>
        <Tip label="Copy first output">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(output[0].content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="px-2"
            disabled={output.length === 0}
          >
            <IconMotion show={copied} HideIcon={ClipboardCopy} />{" "}
            <span className="hidden @[250px]:inline ml-2">Copy</span>
          </Button>
        </Tip>
        <Tip label="Clear output">
          <Button
            variant="outline"
            onClick={() => {
              setOutput([]);
              setCleared(true);
              setTimeout(() => setCleared(false), 1500);
            }}
            className="px-2"
            disabled={output.length === 0}
          >
            <IconMotion show={cleared} HideIcon={Trash} />
            <span className="hidden @[250px]:inline">Clear</span>
          </Button>
        </Tip>
      </div>
      {runStatus === "building" ? (
        <div className="mt-4 flex-col flex justify-center w-full h-[90%] items-center gap-2">
          <Spinner></Spinner>
          <p className="text-sm text-muted-foreground">Building</p>
        </div>
      ) : output.length === 0 && runStatus === "running" ? (
        <div className="mt-4 flex-col flex justify-center w-full h-[90%] items-center gap-2">
          <Spinner></Spinner>
          <p className="text-sm text-muted-foreground">Running</p>
        </div>
      ) : output.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground pl-2">No output yet.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)] w-full">
          {output.map((line, index) => (
            <div
              key={index}
              className={
                "text-xs bg-accent/75 p-2 rounded-md whitespace-pre-wrap break-all my-2 " +
                (line.type === "err" ? " text-destructive" : "")
              }
            >
              {line.testCaseId && (
                <p className="text-[0.6rem] text-accent-foreground/80 mb-1">
                  {line.testCaseName}
                </p>
              )}
              {line.content}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
