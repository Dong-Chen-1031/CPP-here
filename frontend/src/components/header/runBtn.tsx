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
import { ChevronDownIcon, SquareIcon, TestTubes } from "lucide-react";
import { Play } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { getDefaultStore, useAtom } from "jotai";
import {
    codeWorkersStore,
    runModeStore,
    runStatusStore,
    verifyJwtStore,
} from "@/store/atom";

import { handleRun, handleRunAll } from "@/api/run";

import Tip from "@/components/ui/tips";
import { cn, commandKeyIcon } from "@/lib/utils";

import { AnimatePresence, motion } from "motion/react";
import { Kbd } from "@/components/ui/kbd";

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
            )}>
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
    const [hasLoaded, setHasLoaded] = React.useState(false);

    React.useEffect(() => {
        setHasLoaded(true);
    }, []);
    return (
        <ButtonGroup className={className} ref={runBtnGroupRef}>
            <Tip
                show={!cantPress}
                content={
                    runMode === "single" ? (
                        <>
                            {t("headerActions.runCode")}{" "}
                            <Kbd>{commandKeyIcon}</Kbd>
                            <Kbd>⏎</Kbd>
                        </>
                    ) : (
                        <>
                            {t("headerActions.runAllTestCases")}{" "}
                            <Kbd>{commandKeyIcon}</Kbd>
                            <Kbd>⏎</Kbd>
                        </>
                    )
                }>
                <Button
                    variant={
                        runStatus === "running" ? "destructive" : "outline"
                    }
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
                    }}>
                    <AnimatePresence mode="popLayout" initial={hasLoaded}>
                        {!jwt ? (
                            <MotionButtonLabel
                                key="verify"
                                lastWidthRef={lastWidthRef}
                                initial={false}>
                                <Spinner className="size-3" />
                                <span
                                    className="text-xs"
                                    id="runBtnText"
                                    ref={btnTextRef}>
                                    {t("headerActions.verifying")}
                                </span>
                            </MotionButtonLabel>
                        ) : runStatus === "building" ? (
                            <MotionButtonLabel
                                key="building"
                                lastWidthRef={lastWidthRef}>
                                <Spinner className="size-3" />
                                <span
                                    className="text-xs"
                                    id="runBtnText"
                                    ref={btnTextRef}>
                                    {t("headerActions.building")}
                                </span>
                            </MotionButtonLabel>
                        ) : runStatus === "running" ? (
                            <MotionButtonLabel
                                key="running"
                                lastWidthRef={lastWidthRef}
                                className="relative">
                                {/* <Spinner></Spinner> */}
                                <SquareIcon className="" />
                                <span
                                    className="text-xs"
                                    id="runBtnText"
                                    ref={btnTextRef}>
                                    {t("headerActions.stop")}
                                </span>
                            </MotionButtonLabel>
                        ) : runMode === "single" ? (
                            <MotionButtonLabel
                                key="run"
                                lastWidthRef={lastWidthRef}>
                                <Play />
                                <span id="runBtnText" ref={btnTextRef}>
                                    {t("headerActions.run")}
                                </span>
                            </MotionButtonLabel>
                        ) : (
                            <MotionButtonLabel
                                key="run-all"
                                lastWidthRef={lastWidthRef}>
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
                            variant={
                                runStatus === "running"
                                    ? "destructive"
                                    : "outline"
                            }
                            className="p-1"
                            disabled={cantPress || runStatus === "running"}
                            aria-label={t("headerActions.runOptions")}
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
                        className="max-w-fit min-w-fit w-fit">
                        <DropdownMenuGroup>
                            {runMode === "single" ? (
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        setRunMode("all");
                                        handleRunAll();
                                        onClick(e);
                                    }}>
                                    <TestTubes />
                                    <Tip
                                        label={t(
                                            "headerActions.runAllTestCases",
                                        )}>
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
                                    }}>
                                    <Play />
                                    <Tip
                                        label={t(
                                            "headerActions.runCurrentInput",
                                        )}>
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
