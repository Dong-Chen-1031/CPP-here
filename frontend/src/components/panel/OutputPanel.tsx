import { Button } from "@/components/ui/button";
import {
    Trash,
    SquareTerminal,
    ClipboardCopy,
    SquareIcon,
    ChevronRight,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import Tip from "../ui/tips";
import { useAtom, useAtomValue } from "jotai";
import { runStatusStore } from "@/store/atom";
import { buildingWithStore } from "@/service/build";
import { stopBuild } from "@/service/run";
import {
    diffOutput,
    type DiffSegment,
    type OutputDiff,
} from "@/lib/outputDiff";
import { AnimatePresence, motion } from "motion/react";
import { ReducedMotion, spring } from "@/lib/motion";
import { browserCompilerProgressStore } from "@/service/browserBuild";
import { BetaBadge } from "@/components/BetaBadge";
import { cn, randomId } from "@/lib/utils";
import { addAlert } from "@/lib/alert";
import i18next from "i18next";
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

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        addAlert({
            title: i18next.t("editor:output.copyFailedTitle"),
            description: i18next.t("editor:output.copyFailedDescription"),
            variant: "destructive",
        });
        return false;
    }
}

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

function DiffCell({
    segments,
    side,
}: {
    segments?: DiffSegment[];
    side: "expected" | "actual";
}) {
    const { t } = useTranslation(["editor"]);
    if (!segments)
        return (
            <span className="italic text-muted-foreground">
                {t(
                    side === "actual"
                        ? "output.missingLine"
                        : "output.extraLine",
                )}
            </span>
        );
    if (segments.every((segment) => !segment.text))
        return (
            <span className="italic text-muted-foreground">
                {t("output.emptyLine")}
            </span>
        );
    return segments.map((segment, i) =>
        segment.changed ? (
            <mark
                key={i}
                className={cn(
                    "rounded-[2px] text-inherit",
                    side === "expected"
                        ? "bg-(--success)/35"
                        : "bg-destructive/45",
                )}
            >
                {segment.text}
            </mark>
        ) : (
            <span key={i}>{segment.text}</span>
        ),
    );
}

function DiffTable({ diff }: { diff: OutputDiff }) {
    const { t } = useTranslation(["editor"]);
    const lineNo =
        "pl-1.5 pr-2 text-right text-muted-foreground/60 select-none tabular-nums";
    return (
        <div className="mt-1.5 grid grid-cols-[auto_1fr_auto_1fr] rounded-sm overflow-hidden border border-border">
            <div className="col-span-2 px-1.5 py-0.5 bg-muted/60 text-muted-foreground">
                {t("output.expected")}
            </div>
            <div className="col-span-2 px-1.5 py-0.5 bg-muted/60 text-muted-foreground border-l border-border">
                {t("output.actual")}
            </div>
            {diff.rows.map((row, i) => {
                if ("count" in row)
                    return (
                        <div
                            key={i}
                            className="col-span-4 px-1.5 py-0.5 text-center text-muted-foreground bg-muted/30"
                        >
                            {row.kind === "skip" && "⋯ "}
                            {t(
                                row.kind === "skip"
                                    ? "output.skippedLines"
                                    : "output.moreLines",
                                { count: row.count },
                            )}
                        </div>
                    );
                const differs = row.kind !== "same";
                const expectedBg = differs
                    ? row.expected
                        ? "bg-(--success)/10"
                        : "bg-muted/40"
                    : "";
                const actualBg = differs
                    ? row.actual
                        ? "bg-destructive/15"
                        : "bg-muted/40"
                    : "";
                return (
                    <React.Fragment key={i}>
                        <div className={cn(lineNo, expectedBg)}>
                            {row.expectedNo}
                        </div>
                        <div className={cn("pr-1.5", expectedBg)}>
                            <DiffCell segments={row.expected} side="expected" />
                        </div>
                        <div
                            className={cn(
                                lineNo,
                                "border-l border-border",
                                actualBg,
                            )}
                        >
                            {row.actualNo}
                        </div>
                        <div className={cn("pr-1.5", actualBg)}>
                            <DiffCell segments={row.actual} side="actual" />
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function WrongAnswerDiff({ line }: { line: OutputCase }) {
    const { t } = useTranslation(["editor"]);
    const [diff, setDiff] = useState<OutputDiff | null>(null);
    const [open, setOpen] = useState(false);
    const { status, expectedOutput, testCaseId } = line;

    useEffect(() => {
        setDiff(null);
        if (status !== "wa" || expectedOutput === undefined) return;
        let cancelled = false;
        getOutputString(testCaseId).then((actual) => {
            if (!cancelled) setDiff(diffOutput(actual, expectedOutput));
        });
        return () => {
            cancelled = true;
        };
    }, [status, expectedOutput, testCaseId]);

    if (!diff) return null;
    return (
        <div className="mt-2 pt-1.5 border-t border-border whitespace-normal">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <ChevronRight
                    className={cn(
                        "size-3 transition-transform",
                        open && "rotate-90",
                    )}
                />
                <span>{t("output.diffCount", { count: diff.differing })}</span>
                <span aria-hidden>·</span>
                <span>{t(open ? "output.hideDiff" : "output.showDiff")}</span>
            </button>
            <ReducedMotion>
                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div
                            key="diff"
                            className="overflow-hidden whitespace-pre-wrap"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={spring}
                        >
                            <DiffTable diff={diff} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </ReducedMotion>
        </div>
    );
}

function OutputCaseJSX({
    line,
    copiedCases,
    setCopiedCases,
}: OutputCaseJSXProps) {
    const { t } = useTranslation(["editor", "common"]);
    // A case left "running" or "queued" after the run ended (stopped, or the
    // page was reloaded mid-run) is shown as stopped or not run.
    const active = useAtomValue(runStatusStore) === "running";
    const note =
        line.status === "queued"
            ? active
                ? "output.queued"
                : "output.notRun"
            : line.status === "running" && !active
              ? "output.stopped"
              : null;
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
                line.status == "running" && active
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
                                if (
                                    !(await copyText(
                                        await getOutputString(line.testCaseId),
                                    ))
                                )
                                    return;
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
            <WrongAnswerDiff line={line} />
            {note && <p className="text-muted-foreground italic">{t(note)}</p>}
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
    const { target, downloading, verifying, fallbackFrom } = buildingWith;
    return (
        <>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 tabular-nums">
                {downloading
                    ? t("output.compiler.downloading", { progress })
                    : verifying
                      ? t("output.compiler.verifying")
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
                            if (!(await copyText(texts.join("\n")))) return;
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
                <Button
                    aria-label={t("output.clearTip")}
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
