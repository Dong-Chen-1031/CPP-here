import { Button } from "@/components/ui/button";
import { Trash, SquareTerminal, ClipboardCopy, SquareIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import Tip from "../ui/tips";
import { useAtom, useAtomValue } from "jotai";
import { runStatusStore } from "@/store/atom";
import { buildingWithStore } from "@/service/build";
import { stopBuild } from "@/service/run";
import { browserCompilerProgressStore } from "@/service/browserBuild";
import { BetaBadge } from "@/components/BetaBadge";
import { cn, randomId } from "@/lib/utils";
import { EzIconMotion } from "../IconMotion";
import { Spinner } from "../ui/spinner";
import { useTranslation } from "react-i18next";
import {
    getOutputString,
    outputStore,
    type OutputCase,
    outputdb,
    outputChunkToHtml,
    clearOutputBuffer,
} from "@/store/outputStore";
import Dexie, { liveQuery } from "dexie";
import {
    DISPLAY_LIMIT_CHARS,
    DISPLAY_LIMIT_LINES,
    DISPLAY_LIMIT_LINE_CHARS,
} from "@/config/runLimits";

/**
 * `lineChars` is the length of the current unterminated line from earlier
 * chunks; the updated value is returned. Lines past DISPLAY_LIMIT_LINE_CHARS
 * are cut (lineClipped) but later lines still render.
 */
function clipToBudget(
    text: string,
    chars: number,
    lines: number,
    lineChars: number,
) {
    let clipped = text.length > chars;
    const src = clipped ? text.slice(0, chars) : text;
    let kept = "";
    let newlines = 0;
    let lineClipped = false;
    let start = 0;
    for (;;) {
        const nl = src.indexOf("\n", start);
        const end = nl === -1 ? src.length : nl;
        const room = DISPLAY_LIMIT_LINE_CHARS - lineChars;
        if (end - start <= room) {
            kept += src.slice(start, end);
        } else {
            if (room > 0) {
                let cut = start + room;
                // don't split a surrogate pair
                const c = src.charCodeAt(cut - 1);
                if (c >= 0xd800 && c <= 0xdbff) cut--;
                kept += src.slice(start, cut) + "…";
            }
            lineClipped = true;
        }
        lineChars += end - start;
        if (nl === -1) break;
        kept += "\n";
        lineChars = 0;
        start = nl + 1;
        if (++newlines >= lines) {
            clipped ||= start < src.length;
            break;
        }
    }
    return { kept, newlines, clipped, lineChars, lineClipped };
}

interface OutputCaseJSXProps {
    line: OutputCase;
    copiedCases: Record<string, string>;
    setCopiedCases: React.Dispatch<
        React.SetStateAction<Record<string, string>>
    >;
}

function OutputCaseJSX({
    line,
    copiedCases,
    setCopiedCases,
}: OutputCaseJSXProps) {
    const { t } = useTranslation(["editor", "common"]);
    const outputPlace = useRef<HTMLDivElement>(null);
    const [truncated, setTruncated] = useState(false);
    useEffect(() => {
        const container = outputPlace.current;
        if (!line.testCaseId || !container) return;
        let lastId = 0;
        const tid = line.testCaseId;
        let firstRenderedId: number | undefined;
        let cancelled = false;
        let renderedChars = 0;
        let renderedLines = 0;
        let lineChars = 0;
        let isTruncated = false;

        const sub = liveQuery(async () => ({
            firstId: (
                await outputdb.outputChunks
                    .where("testCaseId")
                    .equals(tid)
                    .limit(1)
                    .primaryKeys()
            )[0],
            newChunks: await outputdb.outputChunks
                .where("[testCaseId+id]")
                .between([tid, lastId], [tid, Dexie.maxKey], false, true)
                .toArray(),
        })).subscribe({
            next: ({ firstId, newChunks }) => {
                if (cancelled) return;

                if (
                    firstId === undefined ||
                    (firstRenderedId !== undefined &&
                        firstId !== firstRenderedId)
                ) {
                    container.replaceChildren();
                    firstRenderedId = undefined;
                    renderedChars = 0;
                    renderedLines = 0;
                    lineChars = 0;
                    isTruncated = false;
                    setTruncated(false);
                    if (firstId === undefined) return;
                }

                let html = "";
                for (const chunk of newChunks) {
                    const id = chunk.id;
                    if (id <= lastId) continue;
                    firstRenderedId ??= id;
                    lastId = id;
                    if (isTruncated) {
                        if (chunk.type === "error") {
                            html += outputChunkToHtml(chunk);
                        }
                        continue;
                    }
                    const clip = clipToBudget(
                        chunk.content,
                        DISPLAY_LIMIT_CHARS - renderedChars,
                        DISPLAY_LIMIT_LINES - renderedLines,
                        lineChars,
                    );
                    const { kept, newlines, clipped } = clip;
                    renderedChars += kept.length;
                    renderedLines += newlines;
                    lineChars = clip.lineChars;
                    if (kept) {
                        html += outputChunkToHtml({ ...chunk, content: kept });
                    }
                    if (clip.lineClipped) setTruncated(true);
                    if (
                        clipped ||
                        renderedChars >= DISPLAY_LIMIT_CHARS ||
                        renderedLines >= DISPLAY_LIMIT_LINES
                    ) {
                        isTruncated = true;
                        setTruncated(true);
                    }
                }

                if (html) container.insertAdjacentHTML("beforeend", html);
            },
            error: console.error,
        });

        return () => {
            cancelled = true;
            sub.unsubscribe();
            container.replaceChildren();
        };
    }, [line.testCaseId]);
    return (
        <div
            className={cn(
                "text-xs rounded-md whitespace-pre-wrap break-all my-2 output-card",
                line.type === "err" ? " text-destructive" : "",
                line.status == "running"
                    ? "loading"
                    : line.status === "ac"
                      ? "success"
                      : line.status === "wa"
                        ? "fail"
                        : "",
            )}
        >
            {line.testCaseName && (
                <div className="text-[0.6rem] text-accent-foreground/80 mb-1 flex justify-between">
                    <p>{line.testCaseName}</p>
                    <Tip label={t("output.copyThisCaseTip")}>
                        <div
                            className="cursor-pointer"
                            onClick={async () => {
                                navigator.clipboard.writeText(
                                    await getOutputString(line.testCaseId),
                                );
                                setCopiedCases({
                                    ...copiedCases,
                                    [line.testCaseId]: randomId(),
                                });
                            }}
                        >
                            <EzIconMotion
                                trigger={copiedCases[line.testCaseId]}
                                icon1={ClipboardCopy}
                                className="w-3 h-3"
                            />
                        </div>
                    </Tip>
                </div>
            )}
            <div ref={outputPlace}></div>
            {truncated && (
                <p className="mt-2 text-muted-foreground italic">
                    {t("output.truncated")}
                </p>
            )}
        </div>
    );
}

/** Which compiler the running build uses, whatever the setting. */
function BuildingWith() {
    const buildingWith = useAtomValue(buildingWithStore);
    const progress = Math.max(0, useAtomValue(browserCompilerProgressStore));
    const { t } = useTranslation("editor");
    if (!buildingWith) return null;
    const { target, downloading, fallbackFrom } = buildingWith;
    return (
        <>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 tabular-nums">
                {downloading
                    ? t("output.compiler.downloading", { progress })
                    : t(`output.compiler.${target}`)}
                {target === "browser" && <BetaBadge />}
            </p>
            {downloading && (
                <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
                    <div
                        className="h-full bg-primary transition-[width] duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
            {fallbackFrom && (
                <p className="max-w-72 text-center text-xs text-muted-foreground">
                    {t(
                        target === "browser"
                            ? "output.compiler.fallbackToBrowser"
                            : "output.compiler.fallbackToServer",
                    )}
                </p>
            )}
        </>
    );
}

export default function OutputPanel({ drawer = false }: { drawer?: boolean }) {
    const [output, setOutput] = useAtom(outputStore);
    const [copied, setCopied] = React.useState("");
    const [copiedCasesTimes, setCopiedCasesTimes] = React.useState(
        {} as Record<string, string>,
    );
    const [cleared, setCleared] = React.useState("");
    const [runStatus] = useAtom(runStatusStore);
    const { t } = useTranslation(["editor", "common"]);
    return (
        <div
            className={cn(
                "p-4 border-border border-2 rounded-md h-full @container",
            )}
        >
            <div className="flex gap-2 items-center">
                <SquareTerminal className="w-3 h-3 shrink-0" />
                <p className="text-sm truncate">{t("output.label")}</p>
                <div className="flex-1"></div>
                <Tip label={t("output.copyTip")}>
                    <Button
                        variant="outline"
                        onClick={async () => {
                            const texts = await Promise.all(
                                output.map(
                                    async (o, i) =>
                                        `# ${o.testCaseName || i}\n${await getOutputString(o.testCaseId)}`,
                                ),
                            );
                            navigator.clipboard.writeText(texts.join("\n"));
                            setCopied(randomId());
                        }}
                        className="px-2"
                        disabled={output.length === 0}
                    >
                        <EzIconMotion trigger={copied} icon1={ClipboardCopy} />{" "}
                        <span className="hidden @[250px]:inline ml-2">
                            {t("common:copy")}
                        </span>
                    </Button>
                </Tip>
                <Tip label={t("output.clearTip")}>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setOutput([]);
                            clearOutputBuffer();
                            setCleared(randomId());
                        }}
                        className="px-2"
                        disabled={output.length === 0}
                    >
                        <EzIconMotion trigger={cleared} icon1={Trash} />
                        <span className="hidden @[250px]:inline">
                            {t("common:clear")}
                        </span>
                    </Button>
                </Tip>
            </div>
            {runStatus === "building" ? (
                <div className="mt-4 flex-col flex justify-center w-full h-[90%] items-center gap-2">
                    <Spinner></Spinner>
                    <p className="text-sm text-muted-foreground">
                        {t("common:runStatus.building")}
                    </p>
                    <BuildingWith />
                    <Button
                        variant="outline"
                        size="sm"
                        className="mt-1"
                        onClick={stopBuild}
                    >
                        <SquareIcon />
                        {t("headerActions.stopBuilding")}
                    </Button>
                </div>
            ) : output.length === 0 && runStatus === "running" ? (
                <div className="mt-4 flex-col flex justify-center w-full h-[90%] items-center gap-2">
                    <Spinner></Spinner>
                    <p className="text-sm text-muted-foreground">
                        {t("common:runStatus.running")}
                    </p>
                </div>
            ) : output.length === 0 ? (
                <div className="mt-4">
                    <p className="text-sm text-muted-foreground pl-2">
                        {t("output.noOutput")}
                    </p>
                </div>
            ) : (
                <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)] w-full">
                    {output.map((line) => (
                        <OutputCaseJSX
                            line={line}
                            key={line.testCaseId}
                            setCopiedCases={setCopiedCasesTimes}
                            copiedCases={copiedCasesTimes}
                        ></OutputCaseJSX>
                    ))}
                </div>
            )}
        </div>
    );
}
