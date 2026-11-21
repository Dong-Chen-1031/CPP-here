import "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

import { useAtom } from "jotai";
import { loadedCountStore, loadedStore } from "@/store/atom";

import { AnimatePresence, motion } from "motion/react";
import { fade, ReducedMotion } from "@/lib/motion";
import { useEffect, useRef, type ReactNode } from "react";
import { Commands } from "@/components/Commands";
import { RunButton } from "@/components/header/runBtn";
import { UndoRedo } from "@/components/header/undoRedo";
import { ResetButton } from "@/components/header/resetBtn";
import { FormatButton } from "@/components/header/formatBtn";
import { ShareButton } from "@/components/header/shareBtn";
import { DownloadButton } from "@/components/header/downloadBtn";
import { UploadButton } from "@/components/header/uploadBtn";
import { SettingsButton } from "@/components/header/SettingsBtn";
import { PUBLIC_SHARE } from "astro:env/client";

function LoadingActions({
    className,
    widthKey,
    children,
}: {
    className?: string;
    widthKey: string;
    children: ReactNode;
}) {
    const [loaded] = useAtom(loadedStore);
    const actionsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = actionsRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            const width = el.offsetWidth;
            if (!width) return;
            localStorage.setItem(widthKey, String(width));
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, [loaded, widthKey]);

    return (
        <ReducedMotion>
            <div className="flex items-center h-full">
                <AnimatePresence initial={false} mode="popLayout">
                    {!loaded ? (
                        <motion.div
                            key="loader"
                            exit={{ opacity: 0 }}
                            transition={fade}
                        >
                            <Skeleton
                                className="h-7"
                                style={{
                                    width: `var(--${widthKey}, 0px)`,
                                }}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="actions"
                            ref={actionsRef}
                            className={className}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={fade}
                        >
                            {children}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </ReducedMotion>
    );
}

export default function HeaderActions() {
    const [, setLoadedCount] = useAtom(loadedCountStore);
    useEffect(() => setLoadedCount((c) => c + 1), []);

    return (
        <LoadingActions
            className="flex items-center space-x-2 h-full"
            widthKey="toolbar-width"
        >
            <UndoRedo />
            <UploadButton />
            <DownloadButton />
            {PUBLIC_SHARE && <ShareButton />}
            <SettingsButton />
            <FormatButton />
            <ResetButton />
            {/* <CppVersionSelect /> */}
            <RunButton />
        </LoadingActions>
    );
}

export function HeaderActionsMobile() {
    const [, setLoadedCount] = useAtom(loadedCountStore);
    useEffect(() => setLoadedCount((c) => c + 1), []);

    return (
        <LoadingActions
            className="flex flex-row-reverse flex-wrap justify-start items-center content-start gap-1"
            widthKey="toolbar-width-mobile"
        >
            <RunButton className="shrink-0" />
            <Commands className="shrink-0" />
            <div className="shrink-0 flex items-center">
                <UndoRedo />
            </div>
        </LoadingActions>
    );
}
