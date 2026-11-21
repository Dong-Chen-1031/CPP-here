import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn, useIsMobile } from "@/lib/utils";
import { alertDialogStore, alertStore } from "@/store/atom";
import { useAtom } from "jotai";
import { AlertCircleIcon } from "lucide-react";
import {
    use,
    useEffect,
    useLayoutEffect,
    useState,
    type CSSProperties,
    type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { ReducedMotion, spring } from "@/lib/motion";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function useAlertAnchor(active: boolean) {
    const [style, setStyle] = useState<CSSProperties | null>(null);

    useLayoutEffect(() => {
        if (!active) return;
        const measure = () => {
            const rect = [...document.querySelectorAll("[data-alert-anchor]")]
                .map((el) => el.getBoundingClientRect())
                .find((r) => r.width > 0);
            setStyle(
                rect
                    ? {
                          top: rect.top,
                          right:
                              document.documentElement.clientWidth - rect.right,
                      }
                    : null,
            );
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [active]);

    return active ? style : null;
}

export function Alerts() {
    const [alerts, setAlerts] = useAtom(alertStore);
    const isMobile = useIsMobile();
    const anchorStyle = useAlertAnchor(alerts.length > 0);
    // No early return before this hook: alertStore always holds an array, and an
    // early return would make the hook order conditional.
    useEffect(() => {
        if (alerts.length === 0) return;
        const { id: uuid, duration = 5000 } = alerts[alerts.length - 1];
        const timer = setTimeout(() => {
            setAlerts((prev) => prev.filter((a) => a.id !== uuid));
        }, duration);
        return () => clearTimeout(timer);
    }, [alerts]);

    return (
        <ReducedMotion>
            <div
                className="fixed top-12 md:top-13 right-[2vw] md:right-4 z-100 flex flex-col gap-2"
                style={anchorStyle ?? undefined}
            >
                <AnimatePresence>
                    {alerts.map((item, index) => (
                        <motion.div
                            key={item.id}
                            initial={
                                isMobile
                                    ? { opacity: 0, y: -30 }
                                    : { opacity: 0, x: 10 }
                            }
                            animate={
                                isMobile
                                    ? { opacity: 1, y: 0 }
                                    : { opacity: 1, x: 0 }
                            }
                            exit={
                                isMobile
                                    ? { opacity: 0, y: -30 }
                                    : { opacity: 0, x: 10 }
                            }
                            layoutId={item.id}
                            transition={spring}
                        >
                            <Alert
                                key={item.id}
                                variant={item.variant || "default"}
                                className={cn(
                                    "md:max-w-md max-w-[96vw] border-border",
                                    // The action sits under the text, not beside it
                                    "has-data-[slot=alert-action]:pr-2.5",
                                    !item.description &&
                                        "flex items-center gap-2 py-1.5 has-data-[slot=alert-action]:pr-1.5 *:[svg]:translate-y-0",
                                    item.className,
                                )}
                                onClick={() =>
                                    setAlerts((p) =>
                                        p.filter((_, i) => _.id !== item.id),
                                    )
                                }
                            >
                                {item.icon || (
                                    <AlertCircleIcon className="w-4 h-4" />
                                )}
                                <AlertTitle>{item.title}</AlertTitle>
                                {item.description && (
                                    <AlertDescription className="text-[0.8rem] wrap-normal">
                                        {item.description}
                                    </AlertDescription>
                                )}
                                {item.action && (
                                    <AlertAction
                                        className={
                                            item.description
                                                ? "static col-start-2 mt-1.5 justify-self-start"
                                                : "static ml-2"
                                        }
                                    >
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                item.action!.onClick();
                                                setAlerts((p) =>
                                                    p.filter(
                                                        (a) => a.id !== item.id,
                                                    ),
                                                );
                                            }}
                                        >
                                            {item.action.text}
                                        </Button>
                                    </AlertAction>
                                )}
                            </Alert>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ReducedMotion>
    );
}

export interface AlertDialogOptions {
    title?: string;
    description?: string;
    actions?: { text: string; onClick: () => void; autoFocus?: boolean }[];
    cancelText?: string;
    close?: boolean;

    descriptionNode?: React.ReactNode;
}

export function AlertDialogGood() {
    const [alertDialog, setAlertDialog] = useAtom(alertDialogStore);
    const { t } = useTranslation(["editor", "common"]);
    return (
        <>
            <AlertDialog
                open={alertDialog !== null && alertDialog?.close !== false}
                onOpenChange={() =>
                    setAlertDialog((p) => (p ? { ...p, close: false } : null))
                }
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {alertDialog?.title}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="font-quattro">
                            {alertDialog?.descriptionNode ||
                                alertDialog?.description ||
                                t("editor:alert.defaultDescription")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {alertDialog?.cancelText || t("common:cancel")}
                        </AlertDialogCancel>
                        {alertDialog?.actions?.map((action, index) => (
                            <AlertDialogAction
                                key={index}
                                onClick={action.onClick}
                                autoFocus={action.autoFocus}
                            >
                                {action.text}
                            </AlertDialogAction>
                        ))}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
