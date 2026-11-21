import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { RotateCcw } from "lucide-react";
import { useStore } from "jotai";

import Tip from "@/components/ui/tips";
import {
    codeStore,
    cppVersionStore,
    editorErrorStore,
    inputStore,
    runModeStore,
    testCasesStore,
    useResetEditorAtoms,
} from "@/store/atom";
import {
    clearOutputBuffer,
    outputClearCount,
    outputStore,
} from "@/store/outputStore";
import { addAlert, UNDO_ALERT_MS } from "@/lib/alert";

export function useResetWithUndo() {
    const store = useStore();
    const resetAll = useResetEditorAtoms({ keepSavedOutput: true });
    const { t } = useTranslation(["editor"]);

    return () => {
        const snapshot = {
            code: store.get(codeStore),
            cppVersion: store.get(cppVersionStore),
            input: store.get(inputStore),
            runMode: store.get(runModeStore),
            testCases: store.get(testCasesStore),
            editorErrors: store.get(editorErrorStore),
            output: store.get(outputStore),
        };
        const clears = outputClearCount();
        const outputUntouched = () => outputClearCount() === clears;

        resetAll();
        const clearSavedOutput = setTimeout(() => {
            if (outputUntouched()) clearOutputBuffer();
        }, UNDO_ALERT_MS);

        addAlert({
            title: t("headerActions.resetDoneTitle"),
            icon: <RotateCcw className="w-4 h-4" />,
            duration: UNDO_ALERT_MS,
            action: {
                text: t("headerActions.undoReset"),
                onClick: () => {
                    clearTimeout(clearSavedOutput);
                    store.set(codeStore, snapshot.code);
                    store.set(cppVersionStore, snapshot.cppVersion);
                    store.set(inputStore, snapshot.input);
                    store.set(runModeStore, snapshot.runMode);
                    store.set(testCasesStore, snapshot.testCases);
                    store.set(editorErrorStore, snapshot.editorErrors);
                    if (outputUntouched()) {
                        store.set(outputStore, snapshot.output);
                    }
                },
            },
        });
    };
}

export function ResetButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const reset = useResetWithUndo();
    const { t } = useTranslation(["editor"]);

    return (
        <ButtonGroup>
            <Tip label={t("headerActions.resetEverything")}>
                <Button
                    variant="outline"
                    className={className}
                    onClick={(e) => {
                        reset();
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
