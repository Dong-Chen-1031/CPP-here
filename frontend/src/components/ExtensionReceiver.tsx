import "../lib/i18n";
import { CircleCheckBig } from "lucide-react";
import { useEffect, useRef } from "react";
import { getDefaultStore, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
    alertDialogStore,
    panelDrawerStore,
    testCasesStore,
    type TestCase,
} from "@/store/atom";
import { useIsMobile } from "@/lib/utils";
import { addAlert } from "@/lib/alert";

declare global {
    interface Window {
        /** Polled by the browser extension before it dispatches an "ext" event. */
        eventListenerLoaded?: boolean;
    }
}

/**
 * The "ext" event can be dispatched by anything running on the page, so only
 * the fields we actually consume are trusted — and only after validation.
 */
const ExtEventSchema = z.object({
    name: z.string(),
    group: z.string().optional(),
    // Every problem of a parsed contest shares one batch id; size is the
    // number of problems in the contest (1 for a single problem)
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

type ExtProblem = z.infer<typeof ExtEventSchema>;

/**
 * The extension sends a contest's problems one event at a time. If a send
 * fails midway it stops, so a batch that never fills up is imported with
 * whatever arrived once no more problems come in for this long.
 */
const BATCH_FLUSH_DELAY_MS = 3000;

interface PendingBatch {
    problems: ExtProblem[];
    timer?: number;
}

/**
 * Receives test cases from the browser extension. Mounted once on the editor
 * page (not inside a panel) so it listens on mobile too, where the test case
 * panel only exists while its drawer is open.
 */
export function ExtensionReceiver() {
    const setTestCases = useSetAtom(testCasesStore);
    const setPanel = useSetAtom(panelDrawerStore);
    const setAlertDialog = useSetAtom(alertDialogStore);
    const isMobile = useIsMobile();
    const { t } = useTranslation(["editor"]);

    // Read when an import happens rather than captured by the listener, so
    // the listener doesn't have to be re-attached when the layout changes
    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;

    // Contest problems collected so far, by batch id. Outlives the effect so
    // a re-run doesn't drop problems that have already arrived.
    const pendingBatchesRef = useRef(new Map<string, PendingBatch>());

    useEffect(() => {
        const defaultStore = getDefaultStore();
        const pendingBatches = pendingBatchesRef.current;

        // Imports every problem of a batch at once, so a contest asks to
        // overwrite or insert only once instead of once per problem.
        const importProblems = (problems: ExtProblem[]) => {
            const testCasesFromExtension: TestCase[] = problems.flatMap(
                (problem) =>
                    problem.tests.map((test, index) => ({
                        id: crypto.randomUUID(),
                        name: t("testCase.extension.caseName", {
                            problemName: problem.name,
                            index: index + 1,
                        }),
                        input: test.input,
                        expectedOutput: test.output,
                    })),
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
                    },
                    {
                        text: t("testCase.extension.alertDialog.insert"),
                        autoFocus: true,
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
            // Tells the extension the payload was accepted: it dispatches a
            // cancelable event and treats a canceled one as delivered.
            event.preventDefault();

            const problem = parsed.data;
            console.log("Received ext event with payload:", problem);

            const { batch } = problem;
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
        // The extension waits for this flag before dispatching, so it must
        // only be true while the listener above is actually attached.
        window.eventListenerLoaded = true;
        return () => {
            window.eventListenerLoaded = false;
            window.removeEventListener("ext", handleExtEvent);
        };
    }, [t, setTestCases, setPanel, setAlertDialog]);

    return null;
}
