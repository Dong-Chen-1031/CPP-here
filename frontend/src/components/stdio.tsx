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
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import React, { useRef } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
  testCasesStore,
  type TestCase,
} from "@/store/atom";
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
  const caseNameRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  function handleSubmitWrapper() {
    const name = caseNameRef.current?.value || "";
    const input = inputRef.current?.value || "";
    handleSubmit(name, input);
  }
  return (
    <Dialog>
      {tips ? (
        <TooltipProvider delayDuration={300}>
          <Tip label={tips}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </Tip>
        </TooltipProvider>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-125" showCloseButton={false}>
        <DialogHeader className="p-2">
          <DialogTitle>{title}</DialogTitle>
          {/* <DialogDescription>
              Make changes to your profile here. Click save when you&apos;re
              done.
            </DialogDescription> */}
        </DialogHeader>
        <FieldGroup className="p-2">
          <Field>
            <Label htmlFor="name-1">Case Name</Label>
            <Input
              id="name-1"
              name="name"
              defaultValue={name}
              ref={caseNameRef}
            />
          </Field>
          <Field>
            <Label htmlFor="username-1">Input</Label>
            <Textarea
              className="h-50"
              name="input"
              placeholder="Type your input here."
              defaultValue={input}
              ref={inputRef}
            />
          </Field>
        </FieldGroup>

        <DialogFooter className="border-t-border p-4">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={handleSubmitWrapper}>{submitBtnName}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InputPanel() {
  const [input, setInput] = useAtom(inputStore);
  return (
    <div className="p-4 border-border border-2 rounded-md mr-4 ml-2 mt-0 mb-2 h-[calc(100%-8px)]">
      <div className="flex gap-2 items-center">
        <Keyboard className="w-3 h-3" />
        <p className="text-sm">Input</p>
        <div className="flex-1"></div>
        <Button
          variant="outline"
          onClick={async () => {
            setInput(await navigator.clipboard.readText());
          }}
        >
          <ClipboardPaste /> Paste
        </Button>
        <Button variant="outline" onClick={() => setInput("")}>
          <Trash /> Clear
        </Button>
      </div>
      <div className="mt-4">
        <Textarea
          placeholder="Type your input here."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
    </div>
  );
}

export function TestCasePanel() {
  const [, setInput] = useAtom(inputStore);
  const [testCases, setTestCases] = useAtom(testCasesStore);

  function handleAddTestCase(name: string, input: string) {
    const newTestCase: TestCase = {
      id: crypto.randomUUID(),
      name,
      input,
    };
    setTestCases((prev) => [...prev, newTestCase]);
  }

  return (
    <div className="p-4 border-border border-2 rounded-md mr-4 ml-2 my-2 h-[calc(100%-16px)]">
      <div className="flex gap-2 items-center">
        <TestTubes className="w-3 h-3" />
        <p className="text-sm">Test Case</p>
        <div className="flex-1"></div>
        <TestEditDialog
          trigger={
            <Button variant="outline">
              <CirclePlus /> New
            </Button>
          }
          handleSubmit={handleAddTestCase}
        />
      </div>
      <div className="mt-4 overflow-y-auto max-h-[calc(100%-2rem)]">
        <TooltipProvider delayDuration={300}>
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
                  onClick={() => setInput(testCase.input)}
                >
                  <Tip label="Set Input to this Test Case">
                    <p className="flex-1">{testCase.name}</p>
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
        </TooltipProvider>
      </div>
    </div>
  );
}

export function OutputPanel() {
  const [output, setOutput] = useAtom(outputStore);
  return (
    <div className="p-4 border-border border-2 rounded-md ml-2 mr-4 mt-2 h-[calc(100%-8px)]">
      <div className="flex gap-2 items-center">
        <SquareTerminal className="w-3 h-3" />
        <p className="text-sm">Output</p>
        <div className="flex-1"></div>
        <Button
          variant="outline"
          onClick={() => navigator.clipboard.writeText(output)}
        >
          <ClipboardCopy /> Copy
        </Button>
        <Button variant="outline" onClick={() => setOutput("")}>
          <Trash /> Clear
        </Button>
      </div>
      {output.trim() === "" ? (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground pl-2">No output yet.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)]">
          <div
            className={
              "text-xs bg-accent/75 p-2 rounded-md whitespace-pre-wrap break-all " +
              (output.includes("[err]") ? " text-destructive" : "")
            }
          >
            {output.replaceAll("[err]", "")}
          </div>
        </div>
      )}
    </div>
  );
}
