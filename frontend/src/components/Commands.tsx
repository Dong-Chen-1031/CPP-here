import * as React from "react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { KeyboardIcon, SquareTerminalIcon, TestTubes } from "lucide-react";
import { cn } from "@/lib/utils";
import { panelDrawerStore, type PanelDrawerView } from "@/store/atom";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { CppVersionSelect } from "@/components/header/cppVersionSelect";
import { DownloadButton } from "@/components/header/downloadBtn";
import { FormatButton } from "@/components/header/formatBtn";
import { ResetButton } from "@/components/header/resetBtn";
import { RunButton } from "@/components/header/runBtn";
import { ShareButton } from "@/components/header/shareBtn";
import { UndoRedo } from "@/components/header/undoRedo";
import { SettingsButton } from "@/components/header/SettingsBtn";

export function Commands({ className = "" }: { className?: string }) {
    const [open, setOpen] = React.useState(false);
    const openPanelDrawer = useSetAtom(panelDrawerStore);
    const { t } = useTranslation(["editor"]);

    function handleOpenPanel(panel: PanelDrawerView) {
        setOpen(false);
        openPanelDrawer(panel);
    }

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            <Button
                onClick={() => setOpen(true)}
                variant="outline"
                className="w-fit">
                {/* <Menu></Menu> */}
                {t("commands.menuBtn")}
            </Button>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <Command className="max-h-100">
                    <CommandList className="max-h-100">
                        <CommandEmpty>{t("commands.noResults")}</CommandEmpty>
                        <CommandGroup heading={t("commands.actionsGroup")}>
                            <CommandItem>
                                <UndoRedo menu />
                                <ResetButton onClick={() => setOpen(false)} />
                                {/* <GithubLink /> */}
                                <SettingsButton
                                    onClick={() => setOpen(false)}
                                />
                            </CommandItem>
                            <CommandItem>
                                <FormatButton onClick={() => setOpen(false)} />
                                <DownloadButton
                                    onClick={() => setOpen(false)}
                                />
                                <CppVersionSelect
                                    className="w-25"
                                    // onSelect={() => setOpen(false)}
                                />
                            </CommandItem>
                            <CommandItem>
                                <ShareButton onClick={() => setOpen(false)} />

                                <RunButton
                                    onClick={() => {
                                        setOpen(false);
                                    }}
                                />
                            </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup heading={t("commands.panelsGroup")}>
                            <CommandItem
                                onSelect={() => handleOpenPanel("input")}>
                                <KeyboardIcon className="mr-2 h-4 w-4" />
                                <span>{t("commands.input")}</span>
                            </CommandItem>
                            <CommandItem
                                onSelect={() => handleOpenPanel("testCases")}>
                                <TestTubes />
                                <span className="ml-2">
                                    {t("commands.testCase")}
                                </span>
                            </CommandItem>
                            <CommandItem
                                onSelect={() => handleOpenPanel("output")}>
                                <SquareTerminalIcon className="mr-2" />
                                <span>{t("commands.output")}</span>

                                {/* <CommandShortcut>⌘S</CommandShortcut> */}
                            </CommandItem>
                            <CommandItem
                                onSelect={() => {
                                    window.open(
                                        "https://github.com/Dong-Chen-1031/CPP-Here",
                                        "_blank",
                                        "noopener,noreferrer",
                                    );
                                }}>
                                <SiGithub className="size-4 mr-2" />
                                Star on GitHub
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </CommandDialog>
        </div>
    );
}
