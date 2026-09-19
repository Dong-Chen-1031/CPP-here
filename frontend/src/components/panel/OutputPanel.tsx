import { Button } from "@/components/ui/button";
import { Trash, SquareTerminal, ClipboardCopy } from "lucide-react";
import React, { useEffect, useRef } from "react";

import Tip from "../ui/tips";
import { useAtom } from "jotai";
import { runStatusStore } from "@/store/atom";
import { cn } from "@/lib/utils";
import IconMotion from "../IconMotion";
import { Spinner } from "../ui/spinner";
import { useTranslation } from "react-i18next";
import {
    getOutputString,
    outputStore,
    type OutputCase,
    outputdb,
    outputChunkToHtml,
} from "@/store/outputStore";
import Dexie, { liveQuery } from "dexie";

interface OutputCaseJSXProps {
    line: OutputCase;
    copiedCases: Record<string, boolean>;
    setCopiedCases: React.Dispatch<
        React.SetStateAction<Record<string, boolean>>
    >;
}

function OutputCaseJSX({
    line,
    copiedCases,
    setCopiedCases,
}: OutputCaseJSXProps) {
    const { t } = useTranslation(["editor", "common"]);
    const outputPlace = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const container = outputPlace.current;
        if (!line.testCaseId || !container) return;
        let lastId = 0;
        const tid = line.testCaseId;
        let firstRenderedId: number | undefined;
        let cancelled = false;

        const sub = liveQuery(async () => ({
            firstId: (
                await outputdb.outputChunks
                    .where("testCaseId")
                    .equals(tid)
                    .limit(1)
                    .primaryKeys()
            )[0] as number | undefined,
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
                    if (firstId === undefined) return;
                }

                let html = "";
                for (const chunk of newChunks) {
                    const id = chunk.id as number;
                    if (id <= lastId) continue;
                    html += outputChunkToHtml(chunk);
                    firstRenderedId ??= id;
                    lastId = id;
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
            {line.testCaseId && (
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
                                    [line.testCaseId as string]: true,
                                });

                                setTimeout(
                                    () =>
                                        setCopiedCases((prev) => ({
                                            ...prev,
                                            [line.testCaseId as string]: false,
                                        })),
                                    1500,
                                );
                            }}
                        >
                            <IconMotion
                                show={copiedCases[line.testCaseId]}
                                HideIcon={ClipboardCopy}
                                className="w-3 h-3 "
                            />
                        </div>
                    </Tip>
                </div>
            )}
            <div ref={outputPlace}></div>
        </div>
    );
}

export default function OutputPanel({ drawer = false }: { drawer?: boolean }) {
    const [output, setOutput] = useAtom(outputStore);
    const [copied, setCopied] = React.useState(false);
    const [copiedCases, setCopiedCases] = React.useState(
        {} as Record<string, boolean>,
    );
    const [cleared, setCleared] = React.useState(false);
    const [runStatus] = useAtom(runStatusStore);
    const { t } = useTranslation(["editor", "common"]);
    useEffect(() => {
        const values = Object.values(copiedCases);
        if (values.length > 0 && values.every((v) => !v)) {
            setCopiedCases({});
        }
    }, [copiedCases, output]);
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
                            // Copy every case, not just the first one: in run-all mode there
                            // is one entry per test case.
                            const texts = await Promise.all(
                                output.map(
                                    async (o, i) =>
                                        `# ${o.testCaseName || i}\n${await getOutputString(o.testCaseId)}`,
                                ),
                            );
                            navigator.clipboard.writeText(texts.join("\n"));
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                        }}
                        className="px-2"
                        disabled={output.length === 0}
                    >
                        <IconMotion show={copied} HideIcon={ClipboardCopy} />{" "}
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
                            setCleared(true);
                            setTimeout(() => setCleared(false), 1500);
                        }}
                        className="px-2"
                        disabled={output.length === 0}
                    >
                        <IconMotion show={cleared} HideIcon={Trash} />
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
                            setCopiedCases={setCopiedCases}
                            copiedCases={copiedCases}
                        ></OutputCaseJSX>
                    ))}
                </div>
            )}
        </div>
    );
}
