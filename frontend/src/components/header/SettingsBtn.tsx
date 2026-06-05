import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

import { SettingsIcon } from "lucide-react";

import { useAtom } from "jotai";
import { settingsPanelStore } from "@/store/atom";

export function SettingsButton({
    onClick,
}: {
    onClick?: (e: React.MouseEvent) => void;
}) {
    const [, setSettingsOpen] = useAtom(settingsPanelStore);
    const { t } = useTranslation(["editor"]);

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
                onClick && onClick?.(e);
                setSettingsOpen(true);
            }}>
            <SettingsIcon />
            <span className="inline md:hidden lg:inline">
                {t("headerActions.settings")}
            </span>
        </Button>
    );
}
