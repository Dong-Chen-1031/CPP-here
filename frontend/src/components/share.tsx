import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import React, { useEffect, useRef, useState } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchSharedCode } from "@/api/share";
import { getDefaultStore } from "jotai";
import {
    alertStore,
    codeStore,
    inputStore,
    outputStore,
    testCasesStore,
} from "@/store/atom";

export function ShareReceiveDialog() {
    const [showDialog, setShowDialog] = useState(false);
    const [shareID, setShareID] = useState<string | null>(null);
    const checked = useRef(false);
    const defaultStore = getDefaultStore();

    const [checkedItems, setCheckedItems] = useState({
        code: true,
        input: true,
        testCase: true,
        output: true,
    });

    const table = {
        code: "Code",
        input: "Input",
        testCase: "Test Case",
        output: "Output",
    };

    useEffect(() => {
        if (checked.current) return;
        checked.current = true;
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("shareID")) {
            setShareID(urlParams.get("shareID"));
            setShowDialog(true);
            history.replaceState(null, "", "/editor");
        }
    }, []);

    return (
        <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Receive Shared Code</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div>
                            <p className="sans">
                                Please select the parts you want to receive.
                                <br />
                                They’ll replace the current content in your
                                editor.
                            </p>
                            <FieldGroup className="gap-1 mt-2">
                                {Object.entries(table).map(([key, label]) => (
                                    <Field orientation="horizontal" key={label}>
                                        <Checkbox
                                            id={`terms-checkbox-${label.toLowerCase()}`}
                                            name={`terms-checkbox-${label.toLowerCase()}`}
                                            className="cursor-pointer"
                                            checked={
                                                checkedItems[
                                                    key as keyof typeof checkedItems
                                                ]
                                            }
                                            onCheckedChange={(checked) =>
                                                setCheckedItems((prev) => ({
                                                    ...prev,
                                                    [key]: checked,
                                                }))
                                            }
                                        />
                                        <FieldLabel
                                            htmlFor={`terms-checkbox-${label.toLowerCase()}`}>
                                            {label}
                                        </FieldLabel>
                                    </Field>
                                ))}
                            </FieldGroup>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() =>
                            fetchSharedCode(shareID!).then((res) => {
                                if (!res.ok) {
                                    defaultStore.set(alertStore, (p) => [
                                        ...p,
                                        {
                                            title: "Receive Failed",
                                            description:
                                                "An error occurred while receiving the shared code. Please try again later.",
                                            variant: "destructive",
                                            id: crypto.randomUUID(),
                                        },
                                    ]);
                                    return;
                                }
                                const data = res.data!;
                                if (checkedItems.code) {
                                    defaultStore.set(codeStore, data.code);
                                }
                                if (checkedItems.input) {
                                    defaultStore.set(
                                        inputStore,
                                        data.inputData,
                                    );
                                }
                                if (checkedItems.testCase) {
                                    defaultStore.set(
                                        testCasesStore,
                                        data.testCase,
                                    );
                                }
                                if (checkedItems.output) {
                                    defaultStore.set(
                                        outputStore,
                                        data.outputData,
                                    );
                                }
                                defaultStore.set(alertStore, (p) => [
                                    ...p,
                                    {
                                        title: "Receive Successful",
                                        description:
                                            "The shared code has been received and applied to your editor.",
                                        id: crypto.randomUUID(),
                                    },
                                ]);
                            })
                        }>
                        Receive
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
