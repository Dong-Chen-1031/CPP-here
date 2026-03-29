import * as React from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDownIcon,
  CircleStopIcon,
  RotateCcw,
  SquareIcon,
  TestTubes,
} from "lucide-react";
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
import { getDefaultStore, useAtom } from "jotai";
import {
  codeWorkersStore,
  cppVersionStore,
  editorRefStore,
  panelDrawerStore,
  runModeStore,
  runStatusStore,
  verifyJwtStore,
} from "@/store/atom";

import { undo, redo } from "@codemirror/commands";

import { handleRun, handleRunAll } from "@/api/run";

import Tip from "@/components/ui/tips";
import { useResetAllAtoms } from "@/store/atom";
import { cn, commandKey, useIsMobile } from "@/lib/utils";
import { Kbd } from "./ui/kbd";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

export function UndoRedo({ menu = false }: { menu?: boolean }) {
  const [editorGlobal] = useAtom(editorRefStore);
  const { t } = useTranslation(["editor"]);

  return (
    <ButtonGroup>
      <Tip
        content={
          <>
            {t("headerActions.undo")} <Kbd>{commandKey}</Kbd>
            <Kbd>Z</Kbd>
          </>
        }
      >
        <Button
          variant="outline"
          size={menu ? "sm" : "icon-sm"}
          aria-label={t("headerActions.undo")}
          onClick={() => {
            if (editorGlobal?.current?.view) {
              undo(editorGlobal.current.view);
            } else {
              console.warn("Editor view is not available for undo.");
            }
          }}
        >
          <motion.div
            whileTap={{ rotate: -30 }}
            className="w-full h-full flex items-center justify-center"
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <UndoIcon />
          </motion.div>
          {/* {menu && <span>Undo</span>} */}
        </Button>
      </Tip>
      <Tip
        content={
          <>
            {t("headerActions.redo")} <Kbd>{commandKey}</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>Z</Kbd>
          </>
        }
      >
        <Button
          variant="outline"
          size={menu ? "sm" : "icon-sm"}
          aria-label={t("headerActions.redo")}
          onClick={() => {
            if (editorGlobal?.current?.view) {
              redo(editorGlobal.current.view);
            } else {
              console.warn("Editor view is not available for redo.");
            }
          }}
        >
          <motion.div
            whileTap={{ rotate: 30 }}
            className="w-full h-full flex items-center justify-center"
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <RedoIcon />
          </motion.div>
          {/* {menu && <span>Redo</span>} */}
        </Button>
      </Tip>
    </ButtonGroup>
  );
}

const MotionButtonLabel = React.forwardRef(function MotionButtonLabel(
  {
    children,
    lastWidthRef,
    className = "",
    initial = true,
  }: {
    className?: string;
    children: React.ReactNode;
    lastWidthRef: React.RefObject<number[]>;
    initial?: boolean;
  },
  ref: React.Ref<HTMLDivElement>,
) {
  const el =
    typeof window !== "undefined"
      ? window.document.getElementById("runBtnText")
      : null;

  if (el) {
    const len = el.offsetWidth;
    if (len != lastWidthRef.current[lastWidthRef.current.length - 1]) {
      lastWidthRef.current.push(len);
      lastWidthRef.current = lastWidthRef.current.slice(-2);
      // console.log("Measured width:", lastWidthRef.current);
    }
  }

  // console.log(
  //   "Rendering MotionButtonLabel with children:",
  //   lastWidthRef.current[0],
  // );
  return (
    <motion.div
      ref={ref}
      initial={
        initial && {
          width: `calc(${lastWidthRef.current[1]}px + 1.125rem)`,
          opacity: 0,
        }
      }
      layout
      animate={{ width: "auto", opacity: 1 }}
      // exit={{ width: "auto", opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        // mass: 1,
      }}
      // transition={{
      //   duration: 3,
      // }}
      className={cn(
        "w-full h-full flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap opacity-0",
        className,
      )}
    >
      {children}
    </motion.div>
  );
});

export function RunButton({
  className = "",
  onClick = () => {},
}: {
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const [runMode, setRunMode] = useAtom(runModeStore);
  const [jwt] = useAtom(verifyJwtStore);
  const defaultStore = getDefaultStore();
  const [runStatus] = useAtom(runStatusStore);
  const lastWidthRef = React.useRef([8.2]);
  const runBtnGroupRef = React.useRef<HTMLDivElement>(
    undefined,
  ) as React.RefObject<HTMLDivElement>;
  const btnTextRef = React.useRef<HTMLSpanElement>(null);
  const cantPress = !jwt || (runStatus !== "idle" && runStatus !== "running");
  const { t } = useTranslation(["editor"]);

  return (
    <ButtonGroup className={className} ref={runBtnGroupRef}>
      <Tip
        show={!cantPress}
        content={
          runMode === "single" ? (
            <>
              {t("headerActions.runCode")} <Kbd>{commandKey}</Kbd>
              <Kbd>⏎</Kbd>
            </>
          ) : (
            <>
              {t("headerActions.runAllTestCases")} <Kbd>{commandKey}</Kbd>
              <Kbd>⏎</Kbd>
            </>
          )
        }
      >
        <Button
          variant={runStatus === "running" ? "destructive" : "outline"}
          className="overflow-hidden"
          // style={{ maxWidth: `${buttonMaxWidth}rem` }}
          disabled={cantPress}
          onClick={(e) => {
            if (cantPress) return;
            if (runStatus === "running") {
              defaultStore
                .get(codeWorkersStore)
                .forEach((worker) => worker.terminate());
              defaultStore.set(runStatusStore, "idle");

              return;
            }
            if (runMode === "single") {
              handleRun();
            } else {
              handleRunAll();
            }
            onClick(e);
          }}
        >
          <AnimatePresence mode="popLayout">
            {!jwt ? (
              <MotionButtonLabel
                key="verify"
                lastWidthRef={lastWidthRef}
                initial={false}
              >
                <Spinner className="size-3" />
                <span className="text-xs" id="runBtnText" ref={btnTextRef}>
                  {t("headerActions.verifying")}
                </span>
              </MotionButtonLabel>
            ) : runStatus === "building" ? (
              <MotionButtonLabel key="building" lastWidthRef={lastWidthRef}>
                <Spinner className="size-3" />
                <span className="text-xs" id="runBtnText" ref={btnTextRef}>
                  {t("headerActions.building")}
                </span>
              </MotionButtonLabel>
            ) : runStatus === "running" ? (
              <MotionButtonLabel
                key="running"
                lastWidthRef={lastWidthRef}
                className="relative"
              >
                {/* <Spinner></Spinner> */}
                <SquareIcon className="" />
                <span className="text-xs" id="runBtnText" ref={btnTextRef}>
                  {t("headerActions.stop")}
                </span>
              </MotionButtonLabel>
            ) : runMode === "single" ? (
              <MotionButtonLabel key="run" lastWidthRef={lastWidthRef}>
                <Play />
                <span id="runBtnText" ref={btnTextRef}>
                  {t("headerActions.run")}
                </span>
              </MotionButtonLabel>
            ) : (
              <MotionButtonLabel key="run-all" lastWidthRef={lastWidthRef}>
                <TestTubes />
                <span id="runBtnText" ref={btnTextRef}>
                  {t("headerActions.runAll")}
                </span>
              </MotionButtonLabel>
            )}
          </AnimatePresence>
        </Button>
      </Tip>
      {
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={runStatus === "running" ? "destructive" : "outline"}
              className="p-1"
              disabled={cantPress || runStatus === "running"}
              // asChild
            >
              {/* <motion.div
                  layoutId="1111111"
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -30, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                > */}
              <ChevronDownIcon />
              {/* </motion.div> */}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-w-fit min-w-fit w-fit"
          >
            <DropdownMenuGroup>
              {runMode === "single" ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    setRunMode("all");
                    handleRunAll();
                    onClick(e);
                  }}
                >
                  <TestTubes />
                  <Tip label={t("headerActions.runAllTestCases")}>
                    <p className="text-xs flex-1 text-left">
                      {t("headerActions.runAll")}
                    </p>
                  </Tip>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    setRunMode("single");
                    handleRun();
                    onClick(e);
                  }}
                >
                  <Play />
                  <Tip label={t("headerActions.runCurrentInput")}>
                    <p className="text-xs flex-1 text-left pr-5">
                      {t("headerActions.run")}
                    </p>
                  </Tip>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }

      {/* <Button variant="outline">Run in interactive</Button> */}
    </ButtonGroup>
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
  const { t } = useTranslation(["editor"]);

  return (
    <ButtonGroup>
      <Tip label={t("headerActions.resetEverything")}>
        <Button
          variant="outline"
          className={className}
          onClick={(e) => {
            resetAll();
            onClick(e);
          }}
        >
          <RotateCcw />
          {t("headerActions.resetBtn")}
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
  const [cppVersionClient, setCppVersionClient] = React.useState("c++17");
  useEffect(() => {
    setCppVersionClient(cppVersion);
  }, [cppVersion]);

  return (
    <Select
      value={cppVersionClient}
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
  );
}
