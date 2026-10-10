import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function BetaBadge({ className }: { className?: string }) {
    const { t } = useTranslation("editor");
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center rounded-sm border border-current/30 px-1 text-[0.625rem] leading-3.5 font-medium uppercase opacity-70",
                className,
            )}
        >
            {t("compiler.beta")}
        </span>
    );
}
