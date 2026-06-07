import * as React from "react";
import "@/lib/i18n";

import { SiGithub } from "@icons-pack/react-simple-icons";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useAtom } from "jotai";
import { loadedCountStore, loadedStore } from "@/store/atom";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { Commands } from "@/components/Commands";
import config from "@/config/constants";
import { RunButton } from "@/components/header/runBtn";
import { UndoRedo } from "@/components/header/undoRedo";
import { ResetButton } from "@/components/header/resetBtn";
import { FormatButton } from "@/components/header/formatBtn";
import { ShareButton } from "@/components/header/shareBtn";
import { DownloadButton } from "@/components/header/downloadBtn";
import { UploadButton } from "@/components/header/uploadBtn";
import { SettingsButton } from "@/components/header/SettingsBtn";

export default function HeaderActions() {
    const [loaded] = useAtom(loadedStore);
    const [, setLoadedCount] = useAtom(loadedCountStore);
    useEffect(() => setLoadedCount((c) => c + 1), []);

    return (
        <div className="flex items-center space-x-2 h-full">
            <AnimatePresence initial={false} mode="popLayout">
                {!loaded ? (
                    <motion.div
                        key="loader"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}>
                        <Skeleton className="w-[490px] h-7" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="actions"
                        className="flex items-center space-x-2 h-full"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}>
                        <UndoRedo />
                        <UploadButton />
                        <DownloadButton />
                        {config.share && <ShareButton />}
                        <SettingsButton />
                        <FormatButton />
                        <ResetButton />
                        {/* <CppVersionSelect /> */}
                        <RunButton />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function HeaderActionsMobile() {
    const [loaded] = useAtom(loadedStore);
    const [, setLoadedCount] = useAtom(loadedCountStore);
    useEffect(() => setLoadedCount((c) => c + 1), []);

    return (
        <div className="flex flex-row-reverse flex-wrap justify-start items-center content-start gap-1">
            <AnimatePresence initial={false} mode="popLayout">
                {!loaded ? (
                    <motion.div
                        key="loader"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}>
                        <Skeleton className="w-61.25 h-7" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="actions"
                        className="flex flex-row-reverse flex-wrap justify-start items-center content-start gap-1">
                        <RunButton className="shrink-0" />
                        <Commands className="shrink-0" />
                        <div className="shrink-0 flex items-center">
                            <UndoRedo />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
