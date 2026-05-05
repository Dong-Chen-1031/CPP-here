import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog-fix";
import {
    codeStore,
    defCodeStore,
    editorFontSizeStore,
    settingsPanelStore,
    useResetSettingsAtoms,
} from "@/store/atom";
import { useAtom } from "jotai";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox-fix";
import { useTranslation } from "react-i18next";
import React, { useEffect, useRef } from "react";
import { ButtonGroup } from "./ui/button-group";
import { ListRestart, MinusIcon, PlusIcon } from "lucide-react";
import IconMotion from "./IconMotion";

interface SettingsProps {
    allLangs: Record<string, string>;
}

export function Settings({ allLangs }: SettingsProps) {
    const [open, setOpen] = useAtom(settingsPanelStore);
    const inputRef = useRef<HTMLInputElement>(null);
    const { t, i18n } = useTranslation("editor");
    const [fontSize, setFontSize] = useAtom(editorFontSizeStore);
    const [defCode, setDefCode] = useAtom(defCodeStore);
    const [code, setCode] = useAtom(codeStore);
    const resetSettingsAtoms = useResetSettingsAtoms();

    const matchedLang =
        Object.keys(allLangs).find(
            (code: string) => allLangs[code] === i18n.language,
        ) || null;

    const [localLang, setLocalLang] = React.useState<string | null>(
        matchedLang,
    );
    const [comboOpen, setComboOpen] = React.useState(false);

    useEffect(() => {
        setLocalLang(matchedLang);
    }, [matchedLang]);

    const handleLanguageChange = (newLang: string | null) => {
        if (newLang) {
            setLocalLang(newLang);
            i18n.changeLanguage(allLangs[newLang]);
            setComboOpen(false);
        }
    };

    const [portalContainer, setPortalContainer] =
        React.useState<HTMLDivElement | null>(null);

    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.setSelectionRange(-1, -1);
        }, 10);
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-120 w-[calc(100%-2rem)]">
                <DialogHeader>
                    <DialogTitle>{t("settings.title")}</DialogTitle>
                </DialogHeader>
                <FieldSet>
                    <FieldGroup>
                        <Field
                            orientation="horizontal"
                            className="items-center!">
                            <FieldContent>
                                <FieldLabel>
                                    {t("settings.language")}
                                </FieldLabel>
                                {/* <FieldDescription></FieldDescription> */}
                            </FieldContent>
                            <Combobox
                                open={comboOpen}
                                onOpenChange={setComboOpen}
                                items={Object.keys(allLangs)}
                                onValueChange={handleLanguageChange}
                                value={localLang}>
                                <ComboboxInput
                                    placeholder={t("settings.selectLanguage")}
                                    autoFocus={false}
                                    ref={inputRef}
                                />
                                <ComboboxContent container={portalContainer}>
                                    <ComboboxEmpty>
                                        {t("settings.noLanguage")}
                                    </ComboboxEmpty>
                                    <ComboboxList className="max-h-[300px] overflow-y-auto">
                                        {(item) => (
                                            <ComboboxItem
                                                key={item}
                                                value={item}
                                                autoFocus={false}
                                                onPointerDown={(e) =>
                                                    e.preventDefault()
                                                }
                                                onPointerUp={() =>
                                                    handleLanguageChange(item)
                                                }>
                                                {item}
                                            </ComboboxItem>
                                        )}
                                    </ComboboxList>
                                </ComboboxContent>
                            </Combobox>
                        </Field>
                        <Field
                            orientation="horizontal"
                            className="items-center!">
                            <FieldContent>
                                <FieldLabel>
                                    {t("settings.fontSize")}
                                </FieldLabel>
                                {/* <FieldDescription></FieldDescription> */}
                            </FieldContent>
                            <ButtonGroup
                                orientation="horizontal"
                                aria-label={t("settings.fontSize")}
                                className="h-fit">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label={t("settings.decreaseFontSize")}
                                    onClick={() =>
                                        setFontSize((p) => Math.max(p - 1, 5))
                                    }
                                    disabled={fontSize <= 5}>
                                    <MinusIcon />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label={`${t("settings.fontSize")}: ${fontSize}`}
                                    className="bg-input/30! cursor-default">
                                    {fontSize}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label={t("settings.increaseFontSize")}
                                    onClick={() =>
                                        setFontSize((p) => Math.min(p + 1, 50))
                                    }
                                    disabled={fontSize >= 50}>
                                    <PlusIcon />
                                </Button>
                            </ButtonGroup>
                        </Field>
                        <Field
                            orientation="horizontal"
                            className="items-center!">
                            <FieldContent>
                                <FieldLabel>
                                    {t("settings.defaultCode")}
                                </FieldLabel>
                                <FieldDescription className="text-xs">
                                    {t("settings.defaultCodeDesc")}
                                </FieldDescription>
                            </FieldContent>
                            <ButtonGroup
                                orientation="horizontal"
                                aria-label="Media controls"
                                className="h-fit">
                                <Button
                                    variant="outline"
                                    // size="icon"
                                    onClick={() => setDefCode(code)}
                                    disabled={code === defCode}>
                                    {t("settings.defaultCodeBtn")}
                                </Button>
                            </ButtonGroup>
                        </Field>
                        <Field
                            orientation="horizontal"
                            className="items-center!">
                            <FieldContent>
                                <FieldLabel>
                                    {t("settings.resetSettings")}
                                </FieldLabel>
                                <FieldDescription className="text-xs">
                                    {t("settings.resetSettingsDesc")}
                                </FieldDescription>
                            </FieldContent>
                            <ButtonGroup
                                orientation="horizontal"
                                aria-label="Media controls"
                                className="h-fit">
                                <Button
                                    variant="outline"
                                    onClick={resetSettingsAtoms}>
                                    <IconMotion
                                        show={false}
                                        HideIcon={ListRestart}
                                    />
                                    {t("settings.resetSettingsBtn")}
                                </Button>
                            </ButtonGroup>
                        </Field>
                    </FieldGroup>
                </FieldSet>
                <div ref={setPortalContainer} className="absolute" />
            </DialogContent>
        </Dialog>
    );
}
