import * as React from "react";
import "@/lib/i18n";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";

import { ClipboardCheckIcon, Share2Icon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { addAlert } from "@/lib/alert";

import Tip from "@/components/ui/tips";
import { EzIconMotion } from "@/components/IconMotion";
import { shareCode } from "@/service/share";

export function ShareButton({
    className = "",
    onClick = () => {},
}: {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}) {
    const { t } = useTranslation(["editor"]);
    const [sharing, setSharing] = React.useState(false);
    // Waiting for Turnstile before the share can be sent
    const [verifying, setVerifying] = React.useState(false);
    const [sharedTimes, setSharedTimes] = React.useState(0);

    return (
        <ButtonGroup>
            <Tip label={t("headerActions.shareCodeTip")}>
                <Button
                    variant="outline"
                    // size={"icon-sm"}
                    className={className}
                    aria-label={t("headerActions.shareCodeTip")}
                    onClick={async (e) => {
                        // Still verifying or sending the last one
                        if (sharing) return;
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
                            const result = await shareCode({
                                onVerifying: () => setVerifying(true),
                            });
                            setVerifying(false);

                            if (result.ok) {
                                const shareUrl = `${window.location.origin}/share/${result.shareId as string}`;
                                resolveUrl(shareUrl);

                                const copied = await clipboardWritePromise;

                                window.posthog?.capture("code_shared", {
                                    clipboard_copied: copied,
                                });

                                addAlert({
                                    title: copied
                                        ? t("headerActions.shareSuccessTitle")
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
                                });

                                setSharedTimes((p) => p + 1);
                            } else {
                                rejectUrl(new Error("share_failed"));
                                console.error(
                                    "Failed to share code:",
                                    result.errors,
                                );
                                addAlert({
                                    title: t("headerActions.shareFailedTitle"),
                                    description: t(
                                        "headerActions.shareFailedDescription",
                                    ),
                                    variant: "destructive",
                                });
                            }
                        } catch (error) {
                            rejectUrl(error);
                            console.error(
                                "Unexpected error while sharing code:",
                                error,
                            );
                            addAlert({
                                title: t("headerActions.shareFailedTitle"),
                                description: t(
                                    "headerActions.shareFailedUnexpectedDescription",
                                ),
                                variant: "destructive",
                            });
                        } finally {
                            setSharing(false);
                            setVerifying(false);
                        }
                    }}
                >
                    <EzIconMotion
                        trigger={sharedTimes}
                        icon1={sharing ? Spinner : Share2Icon}
                        icon2={ClipboardCheckIcon}
                        className="size-3"
                    />
                    <span className="inline md:hidden lg:inline">
                        {verifying
                            ? t("headerActions.verifying")
                            : t("headerActions.shareCode")}
                    </span>
                </Button>
            </Tip>
        </ButtonGroup>
    );
}
