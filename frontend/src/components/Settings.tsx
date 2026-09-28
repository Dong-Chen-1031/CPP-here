import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog-fix";
import { codeStore, settingsPanelStore } from "@/store/atom";
import {
    defCodeStore,
    editorFontSizeStore,
    editorTabSizeStore,
    timeLimitStore,
    useResetSettingsAtoms,
} from "@/store/configStore";
import { Input } from "@/components/ui/input";
import { MAX_TIMEOUT_S, NO_TIME_LIMIT } from "@/config/runLimits";
import { useAtom } from "jotai";
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldSet,
} from "@/components/ui/field";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox-fix";
import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState } from "react";
import { ButtonGroup } from "./ui/button-group";
import { ListRestart, MinusIcon, PlusIcon } from "lucide-react";
import { EzIconMotion } from "./IconMotion";
import { codeFormatStyle } from "@/store/configStore";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CppVersionSelect } from "@/components/header/cppVersionSelect";

interface SettingsProps {
    allLangs: Record<string, string>;
}

type SettingType =
    "Select" | "Number" | "Button" | "Custom" | "NumberWithButtons";

interface ValueFieldProps<V> {
    value: V;
    setValue: (value: V) => void;
}

interface BaseSettingsField<T extends SettingType> {
    type: T;
    label: string;
    description?: string;
}

interface SelectField
    extends BaseSettingsField<"Select">, ValueFieldProps<string> {}

interface NumberField
    extends BaseSettingsField<"Number">, ValueFieldProps<number> {
    max?: number;
    min?: number;
    step?: number;
    allowZero?: boolean;
}

interface NumberWithButtonsField extends Omit<NumberField, "type"> {
    type: "NumberWithButtons";
    max?: number;
    min?: number;
    step?: number;
    withButtons?: boolean;
    decreaseButtonAriaLabel?: string;
    increaseButtonAriaLabel?: string;
}

interface CustomField extends BaseSettingsField<"Custom"> {
    render: () => React.ReactNode;
}

interface ButtonField extends BaseSettingsField<"Button"> {
    onClick?: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    buttonText?: string;
}

type SettingsField =
    | SelectField
    | NumberField
    | ButtonField
    | CustomField
    | NumberWithButtonsField;

function NumberFieldTemplate({ field }: { field: NumberField }) {
    const { value, setValue } = field;
    const step = field.step ?? 1;
    const min = field.min ?? -Infinity;
    const max = field.max ?? Infinity;
    const [valueDraft, setValueDraft] = React.useState(String(value));
    useEffect(() => {
        setValueDraft(String(value));
    }, [value]);

    function parseDarftValue(value: unknown): number | null {
        const n = typeof value === "string" ? Number(value.trim()) : value;
        if (typeof n !== "number" || !(n % step == 0)) return null;
        if (field.allowZero === false && n === 0) return null;
        return n >= min && n <= max ? n : null;
    }

    const commitValue = () => {
        if (valueDraft === String(value)) return;
        const parsedValue = parseDarftValue(valueDraft);
        if (parsedValue === null) {
            setValueDraft(String(value));
            return;
        }
        setValue(parsedValue);
    };
    return (
        <Input
            type="number"
            inputMode="numeric"
            min={min}
            step={step}
            max={max}
            className="w-20 shrink-0"
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={(e) => {
                if (e.key === "Enter") commitValue();
            }}
        />
    );
}

function NumberWithButtonsFieldTemplate({
    field,
}: {
    field: NumberWithButtonsField;
}) {
    const { value, setValue, label } = field;
    const min = field.min ?? -Infinity;
    const max = field.max ?? Infinity;
    const decreaseButtonAriaLabel = field.decreaseButtonAriaLabel ?? "Decrease";
    const increaseButtonAriaLabel = field.increaseButtonAriaLabel ?? "Increase";
    const step = field.step ?? 1;

    return (
        <ButtonGroup
            orientation="horizontal"
            aria-label={label}
            className="h-fit"
        >
            <Button
                variant="outline"
                size="icon"
                aria-label={decreaseButtonAriaLabel}
                onClick={() => setValue(Math.max(value - step, min))}
                disabled={value <= min}
            >
                <MinusIcon />
            </Button>
            <Button
                variant="outline"
                size="icon"
                aria-label={`${field.label}: ${field.value}`}
                className="bg-input/30! cursor-default"
            >
                {field.value}
            </Button>
            <Button
                variant="outline"
                size="icon"
                aria-label={increaseButtonAriaLabel}
                onClick={() => setValue(Math.min(value + step, max))}
                disabled={value >= max}
            >
                <PlusIcon />
            </Button>
        </ButtonGroup>
    );
}

function ButtonFieldTemplate({ field }: { field: ButtonField }) {
    return (
        <ButtonGroup
            orientation="horizontal"
            aria-label={field.label}
            className="h-fit"
        >
            <Button
                variant="outline"
                onClick={field.onClick}
                disabled={field.disabled}
            >
                {field.icon}
                {field.buttonText ?? field.label}
            </Button>
        </ButtonGroup>
    );
}

export function SettingFieldTemplate({ field }: { field: SettingsField }) {
    return (
        <Field orientation="horizontal" className="items-center!">
            <FieldContent>
                <FieldLabel>{field.label}</FieldLabel>
                <FieldDescription className="text-xs">
                    {field.description}
                </FieldDescription>
            </FieldContent>
            {field.type === "Custom" ? (
                field.render()
            ) : field.type === "NumberWithButtons" ? (
                <NumberWithButtonsFieldTemplate field={field} />
            ) : field.type === "Button" ? (
                <ButtonFieldTemplate field={field} />
            ) : field.type === "Number" ? (
                <NumberFieldTemplate field={field} />
            ) : null}
        </Field>
    );
}

export function Settings({ allLangs }: SettingsProps) {
    const [open, setOpen] = useAtom(settingsPanelStore);
    const inputRef = useRef<HTMLInputElement>(null);
    const { t, i18n } = useTranslation("editor");
    const [fontSize, setFontSize] = useAtom(editorFontSizeStore);
    const [defCode, setDefCode] = useAtom(defCodeStore);
    const [code, setCode] = useAtom(codeStore);
    const [tabSize, setTabSize] = useAtom(editorTabSizeStore);
    const [timeLimit, setTimeLimit] = useAtom(timeLimitStore);
    const resetSettingsAtoms = useResetSettingsAtoms();

    const matchedLang =
        Object.keys(allLangs).find(
            (code: string) => allLangs[code] === i18n.language,
        ) || null;

    const [localLang, setLocalLang] = React.useState<string | null>(
        matchedLang,
    );
    const [comboOpen, setComboOpen] = React.useState(false);
    const [formatStyle, setFormatStyle] = useAtom(codeFormatStyle);
    useEffect(() => {
        setLocalLang(matchedLang);
    }, [matchedLang]);

    const handleLanguageChange = (newLang: string | null) => {
        if (newLang) {
            setLocalLang(newLang);
            i18n.changeLanguage(allLangs[newLang]);
            setComboOpen(false);
            window.posthog?.capture("settings_language_changed", {
                language: allLangs[newLang],
            });
        }
    };

    const [portalContainer, setPortalContainer] =
        React.useState<HTMLDivElement | null>(null);

    useEffect(() => {
        setTimeout(() => {
            inputRef.current?.setSelectionRange(-1, -1);
        }, 10);
    }, [open]);

    const SettingsFields: SettingsField[] = [
        {
            type: "Custom",
            label: t("settings.cppVersion"),
            render: () => <CppVersionSelect size={"default"} />,
        },
        {
            type: "Custom",
            label: t("settings.language"),
            render: () => (
                <Combobox
                    open={comboOpen}
                    onOpenChange={setComboOpen}
                    items={Object.keys(allLangs)}
                    onValueChange={handleLanguageChange}
                    value={localLang}
                >
                    <ComboboxInput
                        placeholder={t("settings.selectLanguage")}
                        autoFocus={false}
                        ref={inputRef}
                    />
                    <ComboboxContent container={portalContainer}>
                        <ComboboxEmpty>
                            {t("settings.noLanguage")}
                        </ComboboxEmpty>
                        <ComboboxList className="max-h-75 overflow-y-auto">
                            {(item) => (
                                <ComboboxItem
                                    key={item}
                                    value={item}
                                    autoFocus={false}
                                    onPointerDown={(e) => e.preventDefault()}
                                    onPointerUp={() =>
                                        handleLanguageChange(item)
                                    }
                                >
                                    {item}
                                </ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                </Combobox>
            ),
        },
        {
            label: t("settings.fontSize"),
            type: "NumberWithButtons",
            value: fontSize,
            setValue: setFontSize,
            min: 5,
            max: 50,
            step: 1,
            decreaseButtonAriaLabel: t("settings.decreaseFontSize"),
            increaseButtonAriaLabel: t("settings.increaseFontSize"),
        },
        {
            label: t("settings.tabSize"),
            type: "NumberWithButtons",
            value: tabSize,
            setValue: setTabSize,
            min: 1,
            max: 50,
            step: 1,
            decreaseButtonAriaLabel: t("settings.decreaseTabSize"),
            increaseButtonAriaLabel: t("settings.increaseTabSize"),
        },
        {
            label: t("settings.timeLimit"),
            description: t("settings.timeLimitDesc"),
            type: "Number",
            min: NO_TIME_LIMIT,
            step: 1,
            value: timeLimit,
            setValue: setTimeLimit,
            allowZero: false,
            max: MAX_TIMEOUT_S,
        },
        {
            label: t("settings.defaultCode"),
            type: "Button",
            description: t("settings.defaultCodeDesc"),
            buttonText: t("settings.defaultCodeBtn"),
            // icon: <ListRestart />, // TODO: Add a motion effect to this icon when clicked
            onClick: () => setDefCode(code),
            disabled: code === defCode,
        },
        {
            label: t("settings.codeFormatStyle"),
            type: "Custom",
            description: t("settings.codeFormatStyleDesc"),
            render: () => (
                <Select value={formatStyle} onValueChange={setFormatStyle}>
                    <SelectTrigger className="w-full max-w-30">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectLabel>
                                {t("settings.codeFormatStyle")}
                            </SelectLabel>
                            {[
                                "LLVM",
                                "Google",
                                "Chromium",
                                "Mozilla",
                                "WebKit",
                                "Microsoft",
                                "GNU",
                            ].map((item) => (
                                <SelectItem key={item} value={item}>
                                    {item}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
            ),
        },
        {
            label: t("settings.resetSettings"),
            type: "Button",
            description: t("settings.resetSettingsDesc"),
            buttonText: t("settings.resetSettingsBtn"),
            icon: <ListRestart />, // TODO: Add a motion effect to this icon when clicked
            onClick: resetSettingsAtoms,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-120 w-[calc(100%-2rem)]">
                <DialogHeader>
                    <DialogTitle>{t("settings.title")}</DialogTitle>
                </DialogHeader>
                <FieldSet>
                    <FieldGroup>
                        {SettingsFields.map((field, index) => (
                            <SettingFieldTemplate key={index} field={field} />
                        ))}
                    </FieldGroup>
                </FieldSet>
                <div ref={setPortalContainer} className="absolute" />
            </DialogContent>
        </Dialog>
    );
}
