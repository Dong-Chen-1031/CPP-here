import { Button } from "@/components/ui/button";
import { CirclePlus, TestTubes, Trash, Pencil, Play } from "lucide-react";

import Tip from "../ui/tips";
import { useAtom } from "jotai";
import {
    inputStore,
    panelDrawerStore,
    runStatusStore,
    testCaseEditStore,
    testCasesStore,
    type TestCase,
} from "@/store/atom";
import { cn, randomId, useIsMobile } from "@/lib/utils";
import { handleRun } from "@/service/run";
import { useTranslation } from "react-i18next";
import TestEditDialog from "./TestEditDialog";

export default function TestCasePanel({
    drawer = false,
}: {
    drawer?: boolean;
}) {
    const [, setInput] = useAtom(inputStore);
    const [testCases, setTestCases] = useAtom(testCasesStore);
    const [, setPanel] = useAtom(panelDrawerStore);
    const isMobile = useIsMobile();
    const { t } = useTranslation(["editor", "common"]);

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
                    <div className="flex-1"></div>
                    <Tip>
                        <Button
                            variant="outline"
                            className="px-2"
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
                    </Tip>
                </div>
                <div className="mt-4 overflow-y-auto max-h-[calc(100%-2rem)]">
                    {testCases.length === 0 ? (
                        <p className="text-sm text-muted-foreground pl-2">
                            {t("testCase.noTestCase")}
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
                                    <Tip label={t("testCase.setInputTip")}>
                                        <p className="flex-1 truncate">
                                            {testCase.name}
                                        </p>
                                    </Tip>
                                    <Tip label={t("testCase.runTip")}>
                                        <div
                                            className={
                                                cantRun ? "cursor-default" : ""
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
                                                    handleRun({
                                                        input: testCase.input,
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
                                            aria-label={t("testCase.editTip")}
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
                                                        setTestCases((prev) =>
                                                            prev.map((tc) =>
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

                                    <Tip label={t("testCase.deleteTip")}>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            aria-label={t("testCase.deleteTip")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setTestCases((prev) =>
                                                    prev.filter(
                                                        (tc) =>
                                                            tc.id !==
                                                            testCase.id,
                                                    ),
                                                );
                                                window.posthog?.capture(
                                                    "test_case_deleted",
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
        </>
    );
}
