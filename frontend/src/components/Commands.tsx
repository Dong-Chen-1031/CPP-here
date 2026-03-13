import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { KeyboardIcon, SquareTerminalIcon, TestTubes } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunButton, UndoRedo } from "./HeaderActions";
import { DrawerDemo } from "./Drawer";
import { InputPanel, OutputPanel, TestCasePanel } from "./stdio";

export function Commands({ className = "" }: { className?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Button onClick={() => setOpen(true)} variant="outline" className="w-fit">
        {/* <Menu></Menu> */}
        Menu
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem>
                <UndoRedo menu />
              </CommandItem>
              <CommandItem>
                <RunButton onClick={() => setOpen(false)} />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Panels">
              <CommandItem>
                <DrawerDemo
                  title="Input Panel"
                  subTitle="Type your custom input here."
                  trigger={
                    <div className="flex items-center w-full">
                      <KeyboardIcon className="mr-2 h-4 w-4" />
                      <span>Input</span>
                    </div>
                  }
                >
                  <InputPanel drawer />
                </DrawerDemo>
              </CommandItem>
              <CommandItem>
                <DrawerDemo
                  title="Test Cases"
                  subTitle="Click to set the test case to the input."
                  trigger={
                    <div className="flex items-center w-full">
                      <TestTubes />
                      <span className="ml-2">Test Case</span>
                    </div>
                  }
                >
                  <TestCasePanel drawer />
                </DrawerDemo>
              </CommandItem>
              <CommandItem>
                <DrawerDemo
                  title="Output"
                  subTitle="View the output of your code here."
                  trigger={
                    <div className="flex items-center w-full">
                      <SquareTerminalIcon className="mr-2" />
                      <span>Output</span>
                    </div>
                  }
                >
                  <OutputPanel drawer />
                </DrawerDemo>

                {/* <CommandShortcut>⌘S</CommandShortcut> */}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
