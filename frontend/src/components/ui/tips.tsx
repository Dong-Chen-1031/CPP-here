import { useIsMobile } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./tooltip";

export default function Tip({
    label,
    children,
    className,
    content,
    show = null,
}: {
    label?: string;
    content?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    show?: boolean | null;
}) {
    const isMobile = useIsMobile();
    return (show ?? !isMobile) ? (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild className={className}>
                    {children}
                </TooltipTrigger>
                <TooltipContent>{content ?? label}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    ) : (
        <>{children}</>
    );
}
