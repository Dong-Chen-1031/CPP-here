import { useIsMobile } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

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
    <Tooltip>
      <TooltipTrigger asChild className={className}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{content ?? label}</TooltipContent>
    </Tooltip>
  ) : (
    <>{children}</>
  );
}
