import * as React from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["editor"]);
  return (
    <Drawer>
      <DrawerTrigger asChild>
        {trigger || <Button variant="outline">{t("drawer.openBtn")}</Button>}
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
                {t("drawer.closeBtn")}
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
  const { t } = useTranslation(["editor"]);

  React.useEffect(() => {
    if (panel) {
      setActivePanel(panel);
    }
  }, [panel]);

  // Build content with translations
  const panelDrawerContentLocalized: Record<
    PanelDrawerView,
    {
      title: string;
      subTitle: string;
      children: React.ReactNode;
    }
  > = {
    input: {
      title: t("drawer.inputPanel.title"),
      subTitle: t("drawer.inputPanel.subTitle"),
      children: <InputPanel drawer />,
    },
    testCases: {
      title: t("drawer.testCases.title"),
      subTitle: t("drawer.testCases.subTitle"),
      children: <TestCasePanel drawer />,
    },
    output: {
      title: t("drawer.output.title"),
      subTitle: t("drawer.output.subTitle"),
      children: <OutputPanel drawer />,
    },
  };

  const content = panelDrawerContentLocalized[activePanel];

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
                {t("drawer.closeBtn")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
