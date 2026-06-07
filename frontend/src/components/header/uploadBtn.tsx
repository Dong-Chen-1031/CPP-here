import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { Upload } from "lucide-react";

import { useSetAtom } from "jotai";
import { codeStore } from "@/store/atom";

import Tip from "@/components/ui/tips";

export function UploadButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const setCode = useSetAtom(codeStore);
    const { t } = useTranslation(["editor"]);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result;
            if (typeof content === "string") {
                setCode(content);
            }
        };
        reader.readAsText(file);

        // Reset the input so the same file can be uploaded again
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        fileInputRef.current?.click();
        onClick(e);
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".cpp,.c,.cc,.cxx,.h,.hpp,.txt"
                onChange={handleFileChange}
                style={{ display: "none" }}
                aria-label={t("headerActions.uploadCodeTip")}
            />
            <ButtonGroup>
                <Tip label={t("headerActions.uploadCodeTip")}>
                    <Button
                        variant="outline"
                        className={className}
                        aria-label={t("headerActions.uploadCodeTip")}
                        onClick={handleClick}>
                        <Upload />
                        <span className="inline md:hidden lg:inline">
                            {t("headerActions.uploadCode")}
                        </span>
                    </Button>
                </Tip>
            </ButtonGroup>
        </>
    );
}
