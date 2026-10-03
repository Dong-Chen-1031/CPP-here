import "../lib/i18n";
import { CircleCheckBig } from "lucide-react";
import { useEffect } from "react";
import { getDefaultStore, useAtom } from "jotai";
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
    tests: z.array(
        z.object({
            input: z.string(),
            output: z.string(),
        }),
    ),
});

/**
 * Receives test cases from the browser extension. Mounted once on the editor
 * page (not inside a panel) so it listens on mobile too, where the test case
 * panel only exists while its drawer is open.
 */
export function ExtensionReceiver() {
    const [, setTestCases] = useAtom(testCasesStore);
    const [, setPanel] = useAtom(panelDrawerStore);
    const [, setAlertDialog] = useAtom(alertDialogStore);
    const isMobile = useIsMobile();
    const { t } = useTranslation(["editor"]);

    useEffect(() => {
        const defaultStore = getDefaultStore();

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

            const testCaseData = parsed.data;
            const testCasesFromExtension: TestCase[] = testCaseData.tests.map(
                (test, index) => ({
                    id: crypto.randomUUID(),
                    name: t("testCase.extension.caseName", {
                        problemName: testCaseData.name,
                        index: index + 1,
                    }),
                    input: test.input,
                    expectedOutput: test.output,
                }),
            );
            console.log("Received ext event with payload:", testCaseData);

            const importTestCases = (mode: "overwrite" | "insert") => {
                setTestCases((prev) =>
                    mode === "overwrite"
                        ? testCasesFromExtension
                        : [...testCasesFromExtension, ...prev],
                );
                window.posthog?.capture("extension_test_cases_imported", {
                    test_case_count: testCasesFromExtension.length,
                    problem_name: testCaseData.name,
                    mode,
                });
                if (isMobile) {
                    setPanel("testCases");
                }
            };

            if (defaultStore.get(testCasesStore).length === 0) {
                importTestCases("overwrite");
                addAlert({
                    title: t("testCase.extension.alert.title"),
                    description: t("testCase.extension.alert.description", {
                        problemName: testCaseData.name,
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
                        <code>{testCaseData.name}</code>
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

        window.addEventListener("ext", handleExtEvent);
        // The extension waits for this flag before dispatching, so it must
        // only be true while the listener above is actually attached.
        window.eventListenerLoaded = true;
        return () => {
            window.eventListenerLoaded = false;
            window.removeEventListener("ext", handleExtEvent);
        };
    }, [isMobile, t]);

    return null;
}
