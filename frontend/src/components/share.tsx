import "../lib/i18n";
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
import { useTranslation } from "react-i18next";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchSharedCode } from "@/service/share";
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
    const { t } = useTranslation(["editor"]);

    const [checkedItems, setCheckedItems] = useState({
        code: true,
        input: true,
        testCase: true,
        output: true,
    });

    const table = {
        code: t("shareReceive.code"),
        input: t("shareReceive.input"),
        testCase: t("shareReceive.testCase"),
        output: t("shareReceive.output"),
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
                    <AlertDialogTitle>
                        {t("shareReceive.title")}
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div>
                            <p className="sans">
                                {t("shareReceive.description")}
                                <br />
                                {t("shareReceive.descriptionSub")}
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
                    <AlertDialogCancel>
                        {t("shareReceive.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() =>
                            fetchSharedCode(shareID!).then((res) => {
                                if (!res.ok) {
                                    defaultStore.set(alertStore, (p) => [
                                        ...p,
                                        {
                                            title: t(
                                                "shareReceive.receiveFailed",
                                            ),
                                            description: t(
                                                "shareReceive.receiveFailedDesc",
                                            ),
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
                                        title: t("shareReceive.receiveSuccess"),
                                        description: t(
                                            "shareReceive.receiveSuccessDesc",
                                        ),
                                        id: crypto.randomUUID(),
                                    },
                                ]);
                            })
                        }>
                        {t("shareReceive.receive")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
