import * as React from "react";
import "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { FormIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { useAtom } from "jotai";
import { codeStore } from "@/store/atom";

import Tip from "@/components/ui/tips";
import { optionsKeyIcon, shiftKeyIcon } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { ensureFormatterInit, formatCode } from "@/lib/format";

import { EzIconMotion } from "@/components/IconMotion";
export function FormatButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const [code, setCode] = useAtom(codeStore);
    const { t } = useTranslation(["editor"]);
    const [formatting, setFormatting] = React.useState(false);
    const [formattedTimes, setFormattedTimes] = React.useState(0);

    return (
        <ButtonGroup>
            <Tip
                content={
                    <>
                        {t("headerActions.formatCodeTip")}{" "}
                        <Kbd>{optionsKeyIcon}</Kbd>
                        <Kbd>{shiftKeyIcon}</Kbd>
                        <Kbd>F</Kbd>
                    </>
                }
            >
                <Button
                    variant="outline"
                    className={className}
                    onClick={(e) => {
                        const toSetFormatting = setTimeout(() => {
                            setFormatting(true);
                        }, 80);
                        formatCode(code).then((formatted) => {
                            clearTimeout(toSetFormatting);
                            setCode(formatted);
                            setFormatting(false);
                            setFormattedTimes((p) => p + 1);
                            window.posthog?.capture("code_formatted");
                        });
                        onClick(e);
                    }}
                    onMouseEnter={() => {
                        ensureFormatterInit();
                    }}
                >
                    <EzIconMotion
                        trigger={formattedTimes}
                        icon1={formatting ? Spinner : FormIcon}
                        className="size-3"
                    />
                    {t("headerActions.formatCode")}
                </Button>
            </Tip>
        </ButtonGroup>
    );
}
