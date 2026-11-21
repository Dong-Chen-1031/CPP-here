import "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";

import { useAtom } from "jotai";
import { loadedCountStore, loadedStore } from "@/store/atom";

import { AnimatePresence, motion } from "motion/react";
import { ReducedMotion } from "@/lib/motion";
import { useEffect, type ReactNode } from "react";
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

const fade = { duration: 0.2, ease: "easeOut" } as const;

function LoadingActions({
    className,
    children,
}: {
    className?: string;
    children: ReactNode;
}) {
    const [loaded] = useAtom(loadedStore);

    return (
        <ReducedMotion>
            <div className="relative h-full">
                <motion.div
                    className={className}
                    initial={false}
                    animate={{ opacity: loaded ? 1 : 0 }}
                    transition={fade}
                    inert={!loaded}
                >
                    {children}
                </motion.div>
                <AnimatePresence initial={false}>
                    {!loaded && (
                        <motion.div
                            key="loader"
                            className="absolute inset-0 flex items-center"
                            exit={{ opacity: 0 }}
                            transition={fade}
                        >
                            <Skeleton className="w-full h-7" />
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
        <LoadingActions className="flex items-center space-x-2 h-full">
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
        <LoadingActions className="flex flex-row-reverse flex-wrap justify-start items-center content-start gap-1">
            <RunButton className="shrink-0" />
            <Commands className="shrink-0" />
            <div className="shrink-0 flex items-center">
                <UndoRedo />
            </div>
        </LoadingActions>
    );
}
