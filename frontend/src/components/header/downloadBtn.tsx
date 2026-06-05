import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { DownloadIcon } from "lucide-react";

import { useAtom } from "jotai";
import { codeStore } from "@/store/atom";

import Tip from "@/components/ui/tips";

export function DownloadButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const [code] = useAtom(codeStore);
    const { t } = useTranslation(["editor"]);

    return (
        <ButtonGroup>
            <Tip label={t("headerActions.downloadCodeTip")}>
                <Button
                    variant="outline"
                    // size={"icon-sm"}
                    className={className}
                    aria-label={t("headerActions.downloadCodeTip")}
                    onClick={(e) => {
                        const blob = new Blob([code], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "main.cpp";
                        a.click();
                        URL.revokeObjectURL(url);
                        onClick(e);
                    }}>
                    <DownloadIcon />
                    <span className="inline md:hidden lg:inline">
                        {t("headerActions.downloadCode")}
                    </span>
                </Button>
            </Tip>
        </ButtonGroup>
    );
}
