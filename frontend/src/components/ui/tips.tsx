import { useIsMobile } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export default function Tip({
  label,
  children,
  className,
  show = null,
}: {
  label: string;
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
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ) : (
    <>{children}</>
  );
}
