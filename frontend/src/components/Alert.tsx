import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn, useIsMobile } from "@/lib/utils";
import { alertDialogStore, alertStore } from "@/store/atom";
import { useAtom } from "jotai";
import { AlertCircleIcon } from "lucide-react";
import { use, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function Alerts() {
  const [alerts, setAlerts] = useAtom(alertStore);
  const isMobile = useIsMobile();
  if (!alerts) {
    return null;
  }
  useEffect(() => {
    if (alerts.length === 0) return;
    const uuid = alerts[alerts.length - 1].id;
    const timer = setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== uuid));
    }, 5000);
  }, [alerts]);

  return (
    <div className="fixed top-12 md:top-14 right-[2vw] md:right-4 z-100 flex flex-col gap-2">
      <AnimatePresence>
        {alerts.map((item, index) => (
          <motion.div
            key={item.id}
            initial={isMobile ? { opacity: 0, y: -30 } : { opacity: 0, x: 10 }}
            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
            exit={isMobile ? { opacity: 0, y: -30 } : { opacity: 0, x: 10 }}
            layoutId={item.id}
          >
            <Alert
              key={item.id}
              variant={item.variant || "default"}
              className={cn(
                "md:max-w-md max-w-[96vw] border-border",
                item.className,
              )}
              onClick={() =>
                setAlerts((p) => p.filter((_, i) => _.id !== item.id))
              }
            >
              {item.icon || <AlertCircleIcon className="w-4 h-4" />}
              <AlertTitle>{item.title}</AlertTitle>
              <AlertDescription className="text-[0.8rem] wrap-normal">
                {item.description}
              </AlertDescription>
            </Alert>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export interface AlertDialogOptions {
  title?: string;
  description?: string;
  actionText?: string;
  cancelText?: string;
  handleAction: () => void;
}

export function AlertDialogGood() {
  const [alertDialog, setAlertDialog] = useAtom(alertDialogStore);
  return (
    <>
      <AlertDialog
        open={alertDialog !== null}
        onOpenChange={() => setAlertDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {alertDialog?.description || "This action cannot be undone. "}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {alertDialog?.cancelText || "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction onClick={alertDialog?.handleAction}>
              {alertDialog?.actionText || "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
