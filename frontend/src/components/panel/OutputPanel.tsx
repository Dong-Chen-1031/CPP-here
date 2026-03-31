import { Button } from "@/components/ui/button";
import { Trash, SquareTerminal, ClipboardCopy } from "lucide-react";
import React, { useEffect } from "react";

import Tip from "../ui/tips";
import { useAtom } from "jotai";
import { outputStore, runStatusStore } from "@/store/atom";
import { cn } from "@/lib/utils";
import IconMotion from "../IconMotion";
import { Spinner } from "../ui/spinner";
import { useTranslation } from "react-i18next";

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
      className={cn("p-4 border-border border-2 rounded-md h-full @container")}
    >
      <div className="flex gap-2 items-center">
        <SquareTerminal className="w-3 h-3 shrink-0" />
        <p className="text-sm truncate">{t("output.label")}</p>
        <div className="flex-1"></div>
        <Tip label={t("output.copyTip")}>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(output[0].content);
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
            <span className="hidden @[250px]:inline">{t("common:clear")}</span>
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
          {output.map((line, index) => (
            <div
              key={index}
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
                <div className="text-[0.6rem] text-accent-foreground/80 mb-1 flex justify-between ">
                  <p>{line.testCaseName}</p>
                  <Tip label={t("output.copyThisCaseTip")}>
                    <div
                      className="cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(line.content);
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
              <p>{line.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
