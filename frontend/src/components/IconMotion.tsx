import { cn } from "@/lib/utils";
import { CircleCheckBig, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export default function IconMotion({
  show,
  ShowIcon = CircleCheckBig,
  HideIcon,
  className,
}: {
  show: boolean;
  ShowIcon?: LucideIcon;
  HideIcon: LucideIcon;
  className?: string;
}) {
  return (
    <div className="relative flex items-center justify-center w-4 h-4">
      <AnimatePresence initial={false} mode="popLayout">
        {show ? (
          <motion.div
            key="show"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
              duration: 200,
            }}
          >
            <ShowIcon className={cn("w-4 h-4", className)} />
          </motion.div>
        ) : (
          <motion.div
            key="hide"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            // transition={{ duration: 0.2 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
              duration: 200,
            }}
          >
            <HideIcon className={cn("w-4 h-4", className)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
