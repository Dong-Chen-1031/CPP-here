import * as React from "react";
import { useSetAtom } from "jotai";
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
import {
  CppVersionSelect,
  ResetButton,
  RunButton,
  UndoRedo,
} from "./HeaderActions";
import { panelDrawerStore, type PanelDrawerView } from "@/store/atom";

export function Commands({ className = "" }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const openPanelDrawer = useSetAtom(panelDrawerStore);

  function handleOpenPanel(panel: PanelDrawerView) {
    setOpen(false);
    openPanelDrawer(panel);
  }

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
                <ResetButton onClick={() => setOpen(false)} />
              </CommandItem>
              <CommandItem>
                <CppVersionSelect
                  className="w-25"
                  // onSelect={() => setOpen(false)}
                />
                <RunButton
                  onClick={() => {
                    setOpen(false);
                  }}
                />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Panels">
              <CommandItem onSelect={() => handleOpenPanel("input")}>
                <KeyboardIcon className="mr-2 h-4 w-4" />
                <span>Input</span>
              </CommandItem>
              <CommandItem onSelect={() => handleOpenPanel("testCases")}>
                <TestTubes />
                <span className="ml-2">Test Case</span>
              </CommandItem>
              <CommandItem onSelect={() => handleOpenPanel("output")}>
                <SquareTerminalIcon className="mr-2" />
                <span>Output</span>

                {/* <CommandShortcut>⌘S</CommandShortcut> */}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </div>
  );
}
