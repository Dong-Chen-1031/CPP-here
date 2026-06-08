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
                    onClick={async (e) => {
                        setSharing(true);
                        onClick(e);

                        let resolveUrl!: (url: string) => void;
                        let rejectUrl!: (err: unknown) => void;
                        const urlPromise = new Promise<string>((res, rej) => {
                            resolveUrl = res;
                            rejectUrl = rej;
                        });

                        const clipboardSupported =
                            typeof ClipboardItem !== "undefined" &&
                            !!navigator.clipboard?.write;

                        const clipboardWritePromise = clipboardSupported
                            ? navigator.clipboard
                                  .write([
                                      new ClipboardItem({
                                          "text/plain": urlPromise.then(
                                              (url) =>
                                                  new Blob([url], {
                                                      type: "text/plain",
                                                  }),
                                          ),
                                      }),
                                  ])
                                  .then(() => true)
                                  .catch(() => false)
                            : Promise.resolve(false);

                        try {
                            const result = await shareCode();

                            if (result.ok) {
                                const shareUrl = `${window.location.origin}/editor?shareID=${result.shareId as string}`;
                                resolveUrl(shareUrl);

                                const copied = await clipboardWritePromise;

                                defaultStore.set(alertStore, (p) => [
                                    ...p,
                                    {
                                        title: copied
                                            ? t(
                                                  "headerActions.shareSuccessTitle",
                                              )
                                            : t(
                                                  "headerActions.shareLinkReadyTitle",
                                              ),
                                        description: copied
                                            ? t(
                                                  "headerActions.shareSuccessDescription",
                                              )
                                            : t(
                                                  "headerActions.shareLinkReadyDescription",
                                                  { shareUrl },
                                              ),
                                        id: crypto.randomUUID(),
                                    },
                                ]);

                                setShared(true);
                                setTimeout(() => setShared(false), 1500);
                            } else {
                                rejectUrl(new Error("share_failed"));
                                console.error(
                                    "Failed to share code:",
                                    result.errors,
                                );
                                defaultStore.set(alertStore, (p) => [
                                    ...p,
                                    {
                                        title: t(
                                            "headerActions.shareFailedTitle",
                                        ),
                                        description: t(
                                            "headerActions.shareFailedDescription",
                                        ),
                                        variant: "destructive",
                                        id: crypto.randomUUID(),
                                    },
                                ]);
                            }
                        } catch (error) {
                            rejectUrl(error);
                            console.error(
                                "Unexpected error while sharing code:",
                                error,
                            );
                            defaultStore.set(alertStore, (p) => [
                                ...p,
                                {
                                    title: t("headerActions.shareFailedTitle"),
                                    description: t(
                                        "headerActions.shareFailedUnexpectedDescription",
                                    ),
                                    variant: "destructive",
                                    id: crypto.randomUUID(),
                                },
                            ]);
                        } finally {
                            setSharing(false);
                        }
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
