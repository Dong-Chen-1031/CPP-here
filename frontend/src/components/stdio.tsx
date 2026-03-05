import { Button } from "@/components/ui/button";
import {
  ClipboardPaste,
  CirclePlus,
  Keyboard,
  TestTubes,
  Trash,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import React, { useRef, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Tip from "./ui/tips";
import { TooltipProvider } from "./ui/tooltip";

interface EditDialogOptions {
  title?: string;
  name?: string;
  input?: string;
  submitBtnName?: string;
  handleSubmit?: (name: string, input: string) => void;
}

export function TestEditDialog({trigger, title = "New Test Case", name = "Test Case1", input = "", submitBtnName = "Create", handleSubmit = (n, i) => {console.log(n, i)}}: EditDialogOptions & {trigger: React.ReactNode}) {
  const caseNameRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  function handleSubmitWrapper() {    
    const name = caseNameRef.current?.value || "";
    const input = inputRef.current?.value || "";
    handleSubmit(name, input);
  }
  return (
    <Dialog>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
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
              <Input id="name-1" name="name" defaultValue={name} ref={caseNameRef} />
            </Field>
            <Field>
              <Label htmlFor="username-1">Input</Label>
              <Textarea className="h-50" name="input" placeholder="Type your input here." defaultValue={input} ref={inputRef} />
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
  )
}


export default function StdIO() {
  interface TestCase {
    id: string;
    name: string;
    input: string;
  }
  const [input, setInput] = useState("");
  const [testCases, setTestCases] = useState<TestCase[]>([]);

  function handleAddTestCase(name: string, input: string) {
    const newTestCase: TestCase = {
      id: crypto.randomUUID(),
      name,
      input,
    };
    setTestCases((prev) => [...prev, newTestCase]);
  }

  return (
    <div className="w-full flex-col flex gap-4">
      <div className="p-4 border-border border-2 rounded-md mx-4">
        <div className="flex gap-2 items-center">
          <Keyboard className="w-4 h-4" />
          <p>Input</p>
          <div className="flex-1"></div>
          <Button variant="outline">
            <ClipboardPaste /> Paste
          </Button>
          <Button variant="outline">
            <Trash /> Clear
          </Button>
        </div>
        <div className="mt-4">
          <Textarea placeholder="Type your input here." value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
      </div>
      <div className="p-4 border-border border-2 rounded-md mx-4">
        <div className="flex gap-2 items-center">
          <TestTubes className="w-4 h-4" />
          <p>Test Case</p>
          <div className="flex-1"></div>
          <TestEditDialog trigger={
            <Button variant="outline">
              <CirclePlus /> New
            </Button>
          } handleSubmit={handleAddTestCase} />
        </div>
        <div className="mt-4">
          <TooltipProvider delayDuration={300}>
          {testCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test cases yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {testCases.map((testCase, index) => (
              <Tip label="Set Input to this Test Case" key={testCase.id} >
                <div className="text-sm bg-accent p-2 rounded-md cursor-pointer" onClick={()=>setInput(testCase.input)}>
                  <p>{testCase.name}</p>
                  
                  </div>
              </Tip>
              ))}
            </div>
          )}
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
