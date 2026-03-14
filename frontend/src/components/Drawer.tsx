import * as React from "react";
import { useAtom } from "jotai";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { panelDrawerStore, type PanelDrawerView } from "@/store/atom";
import { InputPanel, OutputPanel, TestCasePanel } from "./stdio";

interface DrawerProps {
  title?: string;
  subTitle?: string;
  children?: React.ReactNode;
  trigger?: React.ReactNode;
}
export function DrawerDemo({
  title,
  subTitle,
  children,
  trigger,
}: DrawerProps) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        {trigger || <Button variant="outline">Open Drawer</Button>}
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{subTitle}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{children}</div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" className="mx-2">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const panelDrawerContent: Record<
  PanelDrawerView,
  {
    title: string;
    subTitle: string;
    children: React.ReactNode;
  }
> = {
  input: {
    title: "Input Panel",
    subTitle: "Type your custom input here.",
    children: <InputPanel drawer />,
  },
  testCases: {
    title: "Test Cases",
    subTitle: "Click to set the test case to the input.",
    children: <TestCasePanel drawer />,
  },
  output: {
    title: "Output",
    subTitle: "View the output of your code here.",
    children: <OutputPanel drawer />,
  },
};

export function GlobalPanelDrawer() {
  const [panel, setPanel] = useAtom(panelDrawerStore);
  const [activePanel, setActivePanel] =
    React.useState<PanelDrawerView>("input");

  React.useEffect(() => {
    if (panel) {
      setActivePanel(panel);
    }
  }, [panel]);

  const content = panelDrawerContent[activePanel];

  return (
    <Drawer
      open={Boolean(panel)}
      onOpenChange={(open) => !open && setPanel(null)}
    >
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>{content.title}</DrawerTitle>
            <DrawerDescription>{content.subTitle}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{content.children}</div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline" className="mx-2">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
