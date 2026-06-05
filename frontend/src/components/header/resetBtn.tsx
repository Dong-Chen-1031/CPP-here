import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { RotateCcw } from "lucide-react";

import Tip from "@/components/ui/tips";
import { useResetEditorAtoms } from "@/store/atom";

export function ResetButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const resetAll = useResetEditorAtoms();
    const { t } = useTranslation(["editor"]);

    return (
        <ButtonGroup>
            <Tip label={t("headerActions.resetEverything")}>
                <Button
                    variant="outline"
                    className={className}
                    onClick={(e) => {
                        resetAll();
                        onClick(e);
                    }}>
                    <RotateCcw />
                    {t("headerActions.resetBtn")}
                </Button>
            </Tip>
        </ButtonGroup>
    );
}
