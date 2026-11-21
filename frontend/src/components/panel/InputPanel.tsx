import { Button } from "@/components/ui/button";
import { ClipboardPaste, Keyboard, Trash } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import React from "react";

import { useAtom } from "jotai";
import { inputStore } from "@/store/atom";
import { cn, commandKeyIcon } from "@/lib/utils";
import { addAlert } from "@/lib/alert";
import { EzIconMotion } from "../IconMotion";
import { useTranslation } from "react-i18next";

export default function InputPanel({ drawer = false }: { drawer?: boolean }) {
    const [input, setInput] = useAtom(inputStore);
    const [pastedTimes, setPastedTimes] = React.useState(0);
    const [clearedTimes, setClearedTimes] = React.useState(0);
    const { t } = useTranslation(["editor", "common"]);
    return (
        <div
            className={cn(
                "p-4 border-border border-2 rounded-md h-full @container",
            )}
        >
            <div className="flex gap-2 items-center">
                <Keyboard className="w-3 h-3 shrink-0" />
                <p className="text-sm truncate">{t("input.label")}</p>
                <div className="flex-1"></div>

                <Button
                    aria-label={t("input.pasteTip")}
                    variant="outline"
                    onClick={async () => {
                        try {
                            setInput(await navigator.clipboard.readText());
                            setPastedTimes((p) => p + 1);
                        } catch {
                            addAlert({
                                title: t("input.pasteFailedTitle"),
                                description: t("input.pasteFailedDescription", {
                                    shortcut: commandKeyIcon,
                                }),
                                variant: "destructive",
                            });
                        }
                    }}
                    className="px-2"
                >
                    <EzIconMotion
                        trigger={pastedTimes}
                        icon1={ClipboardPaste}
                    />
                    <span className="hidden @[250px]:inline">
                        {t("input.pasteBtn")}
                    </span>
                </Button>
                <Button
                    aria-label={t("input.clearTip")}
                    variant="outline"
                    onClick={() => {
                        setInput("");
                        setClearedTimes((p) => p + 1);
                    }}
                    disabled={input.length === 0}
                    className="px-2"
                >
                    <EzIconMotion trigger={clearedTimes} icon1={Trash} />
                    <span className="hidden @[250px]:inline">
                        {t("common:clear")}
                    </span>
                </Button>
            </div>
            <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)]">
                <Textarea
                    className="text-xs!"
                    placeholder={t("input.placeholder")}
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                    }}
                    onFocus={(e) =>
                        window.innerWidth > 768 && e.target.select()
                    }
                />
            </div>
        </div>
    );
}
