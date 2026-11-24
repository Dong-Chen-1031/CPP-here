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
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { fetchSharedCode } from "@/service/share";
import { getDefaultStore } from "jotai";
import { codeStore, inputStore, testCasesStore } from "@/store/atom";
import { importOutputCases, outputStore } from "@/store/outputStore";
import { Spinner } from "./ui/spinner";
import { addAlert } from "@/lib/alert";
import { privacyMode } from "@/lib/privacy";
import Tip from "@/components/ui/tips";

export function ShareReceiveDialog() {
    const [showDialog, setShowDialog] = useState(false);
    const [loading, setLoading] = useState(false);
    const [shareId, setShareId] = useState<string | null>(null);
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
        if (urlParams.has("shareId")) {
            setShareId(urlParams.get("shareId"));
            setShowDialog(true);
            // Kept in privacy mode: turning it off reloads the page, which
            // then offers the shared code again.
            if (!privacyMode) history.replaceState(null, "", "/editor");
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
                            <p className="font-quattro">
                                {privacyMode ? (
                                    t("privacy.receiveDisabled")
                                ) : (
                                    <>
                                        {t("shareReceive.description")}
                                        <br />
                                        {t("shareReceive.descriptionSub")}
                                    </>
                                )}
                            </p>
                            <FieldGroup className="gap-1 mt-2">
                                {Object.entries(table).map(([key, label]) => (
                                    <Field orientation="horizontal" key={label}>
                                        <Checkbox
                                            disabled={privacyMode}
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
                                            htmlFor={`terms-checkbox-${label.toLowerCase()}`}
                                        >
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
                    {privacyMode ? (
                        <Tip label={t("privacy.receiveDisabled")}>
                            <AlertDialogAction
                                aria-disabled
                                className="cursor-not-allowed opacity-50 hover:bg-primary"
                                onClick={(e) => {
                                    e.preventDefault();
                                    addAlert({
                                        title: t(
                                            "privacy.receiveDisabledTitle",
                                        ),
                                        description: t(
                                            "privacy.receiveDisabled",
                                        ),
                                    });
                                }}
                            >
                                {t("shareReceive.receive")}
                            </AlertDialogAction>
                        </Tip>
                    ) : (
                        <AlertDialogAction
                            disabled={loading}
                            onClick={(e) => {
                                e.preventDefault();
                                setLoading(true);
                                fetchSharedCode(shareId!).then(async (res) => {
                                    if (!res.ok) {
                                        setLoading(false);
                                        addAlert({
                                            title: t(
                                                "shareReceive.receiveFailed",
                                            ),
                                            description: t(
                                                "shareReceive.receiveFailedDesc",
                                            ),
                                            variant: "destructive",
                                        });
                                        return;
                                    }
                                    const data = res.data;
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
                                            await importOutputCases(
                                                data.outputData,
                                            ),
                                        );
                                    }
                                    addAlert({
                                        title: t("shareReceive.receiveSuccess"),
                                        description: t(
                                            "shareReceive.receiveSuccessDesc",
                                        ),
                                    });
                                    setLoading(false);
                                    setShowDialog(false);
                                });
                            }}
                        >
                            {loading && <Spinner />} {t("shareReceive.receive")}
                        </AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
