import { Button } from "@/components/ui/button";
import {
    CircleCheck,
    CircleMinus,
    CirclePlus,
    CircleX,
    Clock,
    Pencil,
    Play,
    TestTubes,
    TriangleAlert,
    Trash,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import Tip from "../ui/tips";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
    inputStore,
    panelDrawerStore,
    runModeStore,
    runStatusStore,
    testCaseEditStore,
    testCasesStore,
    type TestCase,
} from "@/store/atom";
import { cn, randomId, useIsMobile } from "@/lib/utils";
import { handleRunAll } from "@/service/run";
import { outputStore, type OutputCase } from "@/store/outputStore";
import { addAlert, UNDO_ALERT_MS } from "@/lib/alert";
import { AnimatePresence, motion } from "motion/react";
import { ReducedMotion, spring } from "@/lib/motion";
import { useTranslation } from "react-i18next";
import TestEditDialog from "./TestEditDialog";

type CaseStatus = OutputCase["status"];

function CaseStatusIcon({ status }: { status: CaseStatus }) {
    const { t } = useTranslation(["editor"]);
    const icon =
        status === "ac" ? (
            <CircleCheck className="size-4 text-(--success)" />
        ) : status === "wa" ? (
            <CircleX className="size-4 text-destructive" />
        ) : status === "error" ? (
            <TriangleAlert className="size-4 text-warning" />
        ) : status === "finished" ? (
            <CircleMinus className="size-4 text-muted-foreground" />
        ) : status === "running" ? (
            <Spinner className="size-4" />
        ) : status === "queued" ? (
            <Clock className="size-4 text-muted-foreground" />
        ) : null;
    if (!icon) return null;
    const label = t(
        `testCase.status.${status === "finished" ? "unchecked" : status}`,
    );
    return (
        <Tip label={label}>
            <span className="shrink-0 flex" role="img" aria-label={label}>
                {icon}
            </span>
        </Tip>
    );
}

export default function TestCasePanel({
    drawer = false,
}: {
    drawer?: boolean;
}) {
    const [input, setInput] = useAtom(inputStore);
    const setRunMode = useSetAtom(runModeStore);
    const output = useAtomValue(outputStore);
    const [testCases, setTestCases] = useAtom(testCasesStore);
    const [, setPanel] = useAtom(panelDrawerStore);
    const isMobile = useIsMobile();
    const { t } = useTranslation(["editor", "common"]);

    function deleteTestCase(testCase: TestCase) {
        const index = testCases.findIndex((tc) => tc.id === testCase.id);
        setTestCases((prev) => prev.filter((tc) => tc.id !== testCase.id));
        window.posthog?.capture("test_case_deleted");
        addAlert({
            title: t("testCase.deletedTitle", { name: testCase.name }),
            icon: <Trash className="w-4 h-4" />,
            duration: UNDO_ALERT_MS,
            action: {
                text: t("common:undo"),
                onClick: () =>
                    setTestCases((prev) =>
                        prev.some((tc) => tc.id === testCase.id)
                            ? prev
                            : [
                                  ...prev.slice(0, index),
                                  testCase,
                                  ...prev.slice(index),
                              ],
                    ),
            },
        });
    }

    const [runStatus] = useAtom(runStatusStore);
    const [, setTestCaseEditArgs] = useAtom(testCaseEditStore);

    function handleAddTestCase(name: string, input: string, expected: string) {
        const newTestCase: TestCase = {
            id: randomId(),
            name,
            input,
            expectedOutput: expected,
        };
        setTestCases((prev) => [...prev, newTestCase]);
        window.posthog?.capture("test_case_added", {
            has_expected_output: !!expected,
        });
    }
    const cantRun = runStatus !== "idle";

    const statusOf = (id: string): CaseStatus => {
        const status = output.find((o) => o.testCaseId === id)?.status;
        if ((status === "running" || status === "queued") && !cantRun) return;
        return status;
    };
    const judged = testCases
        .map((testCase) => statusOf(testCase.id))
        .filter((s) => s === "ac" || s === "wa" || s === "error");
    const passed = judged.filter((s) => s === "ac").length;

    return (
        <>
            <div
                className={cn(
                    "p-4 border-border border-2 rounded-md h-full @container",
                )}
            >
                <div className="flex gap-2 items-center">
                    <TestTubes className="w-3 h-3 shrink-0" />
                    <p className="text-sm truncate">{t("testCase.label")}</p>
                    {judged.length > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                            {t("testCase.summary", {
                                passed,
                                total: judged.length,
                            })}
                        </span>
                    )}
                    <div className="flex-1"></div>
                    <Button
                        variant="outline"
                        className="px-2"
                        aria-label={t("headerActions.runAllTestCases")}
                        disabled={cantRun || testCases.length === 0}
                        onClick={(e) => {
                            e.stopPropagation();
                            setRunMode("all");
                            handleRunAll();
                        }}
                    >
                        <Play className="w-4 h-4" />
                        <span className="hidden @[250px]:inline">
                            {t("headerActions.runAll")}
                        </span>
                    </Button>
                    <Button
                        variant="outline"
                        className="px-2"
                        aria-label={t("testCase.addTip")}
                        onClick={(e) => {
                            e.stopPropagation();
                            setTestCaseEditArgs({
                                open: true,
                                name: t("testCase.defaultName", {
                                    index: testCases.length + 1,
                                }),
                                handleSubmit: handleAddTestCase,
                            });
                        }}
                    >
                        <CirclePlus className="w-4 h-4" />
                        <span className="hidden @[250px]:inline">
                            {t("testCase.addBtn")}
                        </span>
                    </Button>
                </div>
                <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)]">
                    {testCases.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-2">
                            {t("testCase.noTestCase")}
                        </p>
                    ) : (
                        <ReducedMotion>
                            <div className="relative flex flex-col gap-2">
                                <AnimatePresence
                                    initial={false}
                                    mode="popLayout"
                                >
                                    {testCases.map((testCase) => (
                                        <motion.div
                                            layout
                                            initial={{
                                                opacity: 0,
                                                scale: 0.97,
                                            }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.97 }}
                                            transition={spring}
                                            key={testCase.id}
                                            className={cn(
                                                "text-sm p-2 rounded-md cursor-pointer flex items-center justify-between gap-2 ring-1",
                                                testCase.input === input
                                                    ? "bg-accent ring-ring/60"
                                                    : "bg-accent/75 hover:bg-accent ring-transparent",
                                            )}
                                            aria-current={
                                                testCase.input === input ||
                                                undefined
                                            }
                                            onClick={() => {
                                                setInput(testCase.input);
                                                isMobile && setPanel("input");
                                            }}
                                        >
                                            <Tip
                                                label={t(
                                                    "testCase.setInputTip",
                                                )}
                                            >
                                                <p className="flex-1 truncate">
                                                    {testCase.name}
                                                </p>
                                            </Tip>
                                            <CaseStatusIcon
                                                status={statusOf(testCase.id)}
                                            />
                                            <Tip label={t("testCase.runTip")}>
                                                <div
                                                    className={
                                                        cantRun
                                                            ? "cursor-default"
                                                            : ""
                                                    }
                                                >
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        aria-label={t(
                                                            "testCase.runTip",
                                                        )}
                                                        // className="disabled:cursor-default!"
                                                        disabled={cantRun}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRunAll({
                                                                caseIds: [
                                                                    testCase.id,
                                                                ],
                                                            });
                                                        }}
                                                    >
                                                        <Play className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </Tip>
                                            <Tip label={t("testCase.editTip")}>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    aria-label={t(
                                                        "testCase.editTip",
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTestCaseEditArgs({
                                                            open: true,
                                                            title: t(
                                                                "testCase.editDialog.title",
                                                            ),
                                                            name: testCase.name,
                                                            input: testCase.input,
                                                            expected:
                                                                testCase.expectedOutput,
                                                            submitBtnName: t(
                                                                "testCase.editDialog.saveBtn",
                                                            ),
                                                            handleSubmit: (
                                                                name,
                                                                input,
                                                                expected,
                                                            ) => {
                                                                setTestCases(
                                                                    (prev) =>
                                                                        prev.map(
                                                                            (
                                                                                tc,
                                                                            ) =>
                                                                                tc.id ===
                                                                                testCase.id
                                                                                    ? {
                                                                                          ...tc,
                                                                                          name,
                                                                                          input,
                                                                                          expectedOutput:
                                                                                              expected,
                                                                                      }
                                                                                    : tc,
                                                                        ),
                                                                );
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                            </Tip>

                                            <Tip
                                                label={t("testCase.deleteTip")}
                                            >
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    aria-label={t(
                                                        "testCase.deleteTip",
                                                    )}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        deleteTestCase(
                                                            testCase,
                                                        );
                                                    }}
                                                >
                                                    <Trash className="w-4 h-4" />
                                                </Button>
                                            </Tip>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </ReducedMotion>
                    )}
                </div>
            </div>
        </>
    );
}
