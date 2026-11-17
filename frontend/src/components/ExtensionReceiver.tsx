import "../lib/i18n";
import { CircleCheckBig } from "lucide-react";
import { useEffect, useRef } from "react";
import { getDefaultStore, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
    alertDialogStore,
    panelDrawerStore,
    runModeStore,
    testCasesStore,
    type TestCase,
} from "@/store/atom";
import { randomId, useIsMobile } from "@/lib/utils";
import { addAlert } from "@/lib/alert";
import { defCodeStore } from "@/store/configStore";

declare global {
    interface Window {
        eventListenerLoaded?: boolean;
    }
}

const ExtEventSchema = z.object({
    name: z.string(),
    group: z.string().optional(),
    batch: z
        .object({
            id: z.string(),
            size: z.number().int().positive(),
        })
        .optional(),
    tests: z.array(
        z.object({
            input: z.string(),
            output: z.string(),
        }),
    ),
});

type ExtEvent = z.infer<typeof ExtEventSchema>;

interface ReceivedProblem {
    name: string;
    group?: string;
    testCases: TestCase[];
}

const BATCH_FLUSH_DELAY_MS = 3000;

interface PendingBatch {
    problems: ReceivedProblem[];
    timer?: number;
}

export function ExtensionReceiver() {
    const setTestCases = useSetAtom(testCasesStore);
    const setPanel = useSetAtom(panelDrawerStore);
    const setAlertDialog = useSetAtom(alertDialogStore);
    const setRunMode = useSetAtom(runModeStore);
    const isMobile = useIsMobile();
    const { t } = useTranslation(["editor"]);

    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;

    const pendingBatchesRef = useRef(new Map<string, PendingBatch>());

    useEffect(() => {
        const pendingBatches = pendingBatchesRef.current;
        return () => {
            for (const pending of pendingBatches.values()) {
                window.clearTimeout(pending.timer);
            }
            pendingBatches.clear();
        };
    }, []);

    useEffect(() => {
        const defaultStore = getDefaultStore();
        const pendingBatches = pendingBatchesRef.current;

        const importProblems = (problems: ReceivedProblem[]) => {
            const testCasesFromExtension = problems.flatMap(
                (problem) => problem.testCases,
            );
            const displayName =
                problems.length === 1
                    ? problems[0].name
                    : problems[0].group || problems[0].name;

            const importTestCases = (mode: "overwrite" | "insert") => {
                setTestCases((prev) =>
                    mode === "overwrite"
                        ? testCasesFromExtension
                        : [...testCasesFromExtension, ...prev],
                );
                window.posthog?.capture("extension_test_cases_imported", {
                    test_case_count: testCasesFromExtension.length,
                    problem_count: problems.length,
                    problem_name: displayName,
                    mode,
                });
                setRunMode("all");
                if (isMobileRef.current) {
                    setPanel("testCases");
                }
            };

            if (defaultStore.get(testCasesStore).length === 0) {
                importTestCases("overwrite");
                addAlert({
                    title: t("testCase.extension.alert.title"),
                    description: t("testCase.extension.alert.description", {
                        problemName: displayName,
                    }),
                    icon: <CircleCheckBig className="w-4 h-4" />,
                });
                return;
            }

            const alertDialogDescription = t(
                "testCase.extension.alertDialog.description",
                {
                    problemName: "||||",
                },
            ).split("||||");
            setAlertDialog({
                title: t("testCase.extension.alertDialog.title"),
                descriptionNode: (
                    <>
                        {alertDialogDescription[0]}
                        <code>{displayName}</code>
                        {alertDialogDescription[1]}
                    </>
                ),
                actions: [
                    {
                        text: t("testCase.extension.alertDialog.overwrite"),
                        onClick: () => importTestCases("overwrite"),
                        autoFocus: true,
                    },
                    {
                        text: t("testCase.extension.alertDialog.insert"),
                        onClick: () => importTestCases("insert"),
                    },
                ],
                cancelText: t("testCase.extension.alertDialog.cancel"),
            });
        };

        const handleExtEvent = (event: Event) => {
            const parsed = ExtEventSchema.safeParse(
                (event as CustomEvent<unknown>).detail,
            );
            if (!parsed.success) {
                console.warn(
                    "Ignoring malformed ext event",
                    parsed.error.issues,
                );
                return;
            }

            console.log("Received ext event with payload:", parsed.data);

            const { name, group, batch, tests } = parsed.data;
            const problem: ReceivedProblem = {
                name,
                group,
                testCases: tests.map((test, index) => ({
                    id: randomId(),
                    name: t("testCase.extension.caseName", {
                        problemName: name,
                        index: index + 1,
                    }),
                    input: test.input,
                    expectedOutput: test.output,
                })),
            };

            receiveProblem(problem, batch);

            event.preventDefault();
        };

        const receiveProblem = (
            problem: ReceivedProblem,
            batch: ExtEvent["batch"],
        ) => {
            if (!batch || batch.size <= 1) {
                importProblems([problem]);
                return;
            }

            const pending = pendingBatches.get(batch.id) ?? { problems: [] };
            pending.problems.push(problem);
            window.clearTimeout(pending.timer);

            const flush = () => {
                pendingBatches.delete(batch.id);
                importProblems(pending.problems);
            };

            if (pending.problems.length >= batch.size) {
                flush();
            } else {
                pending.timer = window.setTimeout(flush, BATCH_FLUSH_DELAY_MS);
                pendingBatches.set(batch.id, pending);
            }
        };

        window.addEventListener("ext", handleExtEvent);
        window.eventListenerLoaded = true;
        return () => {
            window.eventListenerLoaded = false;
            window.removeEventListener("ext", handleExtEvent);
        };
    }, [t, setTestCases, setPanel, setAlertDialog]);

    return null;
}
