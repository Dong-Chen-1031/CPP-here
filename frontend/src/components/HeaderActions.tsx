import * as React from "react";
import "@/lib/i18n";

import { SiGithub } from "@icons-pack/react-simple-icons";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";

import { SettingsIcon } from "lucide-react";

import { useAtom } from "jotai";
import {
    loadedCountStore,
    loadedStore,
    settingsPanelStore,
} from "@/store/atom";

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

export function SettingsButton({
    onClick,
}: {
    onClick?: (e: React.MouseEvent) => void;
}) {
    const [, setSettingsOpen] = useAtom(settingsPanelStore);
    const { t } = useTranslation(["editor"]);

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
                onClick && onClick?.(e);
                setSettingsOpen(true);
            }}>
            <SettingsIcon />
            <span className="inline md:hidden lg:inline">
                {t("headerActions.settings")}
            </span>
        </Button>
    );
}

export function GithubLink({
    className = "",
    size = "sm",
}: {
    className?: string;
    size?: typeof Button.prototype.props.size;
}) {
    return (
        <Button variant={"outline"} size={size} asChild className={className}>
            <a
                href={config.githubLink}
                target="_blank"
                rel="noopener noreferrer">
                <SiGithub className="w-5 h-5 mr-1" />
                Star
            </a>
        </Button>
    );
}

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
