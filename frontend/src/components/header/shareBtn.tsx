import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { ClipboardCheckIcon, Share2Icon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { getDefaultStore } from "jotai";
import { alertStore } from "@/store/atom";

import Tip from "@/components/ui/tips";
import IconMotion from "@/components/IconMotion";
import { shareCode } from "@/api/share";

export function ShareButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const { t } = useTranslation(["editor"]);
    const [sharing, setSharing] = React.useState(false);
    const [shared, setShared] = React.useState(false);
    const defaultStore = getDefaultStore();

    return (
        <ButtonGroup>
            <Tip label={t("headerActions.shareCodeTip")}>
                <Button
                    variant="outline"
                    // size={"icon-sm"}
                    className={className}
                    aria-label={t("headerActions.shareCodeTip")}
                    onClick={(e) => {
                        setSharing(true);
                        shareCode().then(async (result) => {
                            if (result.ok) {
                                await navigator.clipboard.writeText(
                                    `${window.location.origin}/editor?shareID=${result.shareId as string}`,
                                );
                                defaultStore.set(alertStore, (p) => [
                                    ...p,
                                    {
                                        title: "Share Successful",
                                        description:
                                            "Share URL has been copied to clipboard. You can share it with others now!",
                                        id: crypto.randomUUID(),
                                    },
                                ]);
                            } else {
                                console.error(
                                    "Failed to share code:",
                                    result.errors,
                                );
                                defaultStore.set(alertStore, (p) => [
                                    ...p,
                                    {
                                        title: "Share Failed",
                                        description:
                                            "An error occurred while sharing your code. Please try again later.",
                                        variant: "destructive",
                                        id: crypto.randomUUID(),
                                    },
                                ]);
                                return;
                            }
                            setSharing(false);
                            setShared(true);
                            setTimeout(() => setShared(false), 1500);
                        });
                        onClick(e);
                    }}>
                    <IconMotion
                        show={shared}
                        HideIcon={sharing ? Spinner : Share2Icon}
                        ShowIcon={ClipboardCheckIcon}
                        className="size-3"
                    />
                    <span className="inline md:hidden lg:inline">
                        {t("headerActions.shareCode")}
                    </span>
                </Button>
            </Tip>
        </ButtonGroup>
    );
}
