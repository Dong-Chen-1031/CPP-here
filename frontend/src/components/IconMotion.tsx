import { cn } from "@/lib/utils";
import { CircleCheckBig, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ElementType } from "react";

function IconMotion({
    show,
    ShowIcon = CircleCheckBig,
    HideIcon,
    className,
}: {
    show: boolean;
    ShowIcon?: ElementType;
    HideIcon: ElementType;
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

export const EzIconMotion = ({
    icon1,
    icon2 = CircleCheckBig,
    trigger,
    duration = 1500,
    className,
}: {
    icon1: ElementType;
    icon2?: ElementType;
    trigger: any;
    duration?: number;
    className?: string;
}) => {
    const [show2, setShow2] = useState(false);
    const [oldTrigger, setOldTrigger] = useState<any>(trigger);
    const timeOutRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (oldTrigger !== trigger) {
            setShow2(true);
            setOldTrigger(trigger);
            if (timeOutRef.current) {
                clearTimeout(timeOutRef.current);
            }
            timeOutRef.current = setTimeout(() => {
                setShow2(false);
            }, duration);
        }
    }, [trigger]);

    return (
        <IconMotion
            show={show2}
            ShowIcon={icon2}
            HideIcon={icon1}
            className={className}
        />
    );
};
