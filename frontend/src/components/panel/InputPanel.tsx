import { Button } from "@/components/ui/button";
import { ClipboardPaste, Keyboard, Trash } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import React from "react";

import Tip from "../ui/tips";
import { useAtom } from "jotai";
import { inputStore } from "@/store/atom";
import { cn } from "@/lib/utils";
import IconMotion from "../IconMotion";
import { useTranslation } from "react-i18next";

export default function InputPanel({ drawer = false }: { drawer?: boolean }) {
  const [input, setInput] = useAtom(inputStore);
  const [pasted, setPasted] = React.useState(false);
  const [cleared, setCleared] = React.useState(false);
  const { t } = useTranslation(["editor", "common"]);
  return (
    <div
      className={cn("p-4 border-border border-2 rounded-md h-full @container")}
    >
      <div className="flex gap-2 items-center">
        <Keyboard className="w-3 h-3 shrink-0" />
        <p className="text-sm truncate">{t("input.label")}</p>
        <div className="flex-1"></div>

        <Tip label={t("input.pasteTip")}>
          <Button
            variant="outline"
            onClick={async () => {
              setInput(await navigator.clipboard.readText());
              setPasted(true);
              setTimeout(() => setPasted(false), 1500);
            }}
            className="px-2"
          >
            <IconMotion show={pasted} HideIcon={ClipboardPaste} />
            <span className="hidden @[250px]:inline">
              {t("input.pasteBtn")}
            </span>
          </Button>
        </Tip>
        <Tip label={t("input.clearTip")}>
          <Button
            variant="outline"
            onClick={() => {
              setInput("");
              setCleared(true);
              setTimeout(() => setCleared(false), 1500);
            }}
            disabled={input.length === 0}
            className="px-2"
          >
            <IconMotion show={cleared} HideIcon={Trash} />
            <span className="hidden @[250px]:inline">{t("common:clear")}</span>
          </Button>
        </Tip>
      </div>
      <div className="mt-4 overflow-y-auto h-[calc(100%-2rem)]">
        <Textarea
          className="text-xs!"
          placeholder={t("input.placeholder")}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
          }}
          onFocus={(e) => window.innerWidth > 768 && e.target.select()}
        />
      </div>
    </div>
  );
}
