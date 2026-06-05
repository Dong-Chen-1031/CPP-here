import * as React from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { ButtonGroup } from "@/components/ui/button-group";
import { UndoIcon, RedoIcon } from "lucide-react";
import { useAtom } from "jotai";
import { editorRefStore } from "@/store/atom";

import { undo, redo } from "@codemirror/commands";

import Tip from "@/components/ui/tips";
import { commandKeyIcon } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { motion } from "motion/react";

export function UndoRedo({ menu = false }: { menu?: boolean }) {
    const [editorGlobal] = useAtom(editorRefStore);
    const { t } = useTranslation(["editor"]);

    return (
        <ButtonGroup>
            <Tip
                content={
                    <>
                        {t("headerActions.undo")} <Kbd>{commandKeyIcon}</Kbd>
                        <Kbd>Z</Kbd>
                    </>
                }>
                <Button
                    variant="outline"
                    size={menu ? "sm" : "icon-sm"}
                    aria-label={t("headerActions.undo")}
                    onClick={() => {
                        if (editorGlobal?.current?.view) {
                            undo(editorGlobal.current.view);
                        } else {
                            console.warn(
                                "Editor view is not available for undo.",
                            );
                        }
                    }}>
                    <motion.div
                        whileTap={{ rotate: -30 }}
                        className="w-full h-full flex items-center justify-center"
                        transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 25,
                        }}>
                        <UndoIcon />
                    </motion.div>
                    {/* {menu && <span>Undo</span>} */}
                </Button>
            </Tip>
            <Tip
                content={
                    <>
                        {t("headerActions.redo")} <Kbd>{commandKeyIcon}</Kbd>
                        <Kbd>⇧</Kbd>
                        <Kbd>Z</Kbd>
                    </>
                }>
                <Button
                    variant="outline"
                    size={menu ? "sm" : "icon-sm"}
                    aria-label={t("headerActions.redo")}
                    onClick={() => {
                        if (editorGlobal?.current?.view) {
                            redo(editorGlobal.current.view);
                        } else {
                            console.warn(
                                "Editor view is not available for redo.",
                            );
                        }
                    }}>
                    <motion.div
                        whileTap={{ rotate: 30 }}
                        className="w-full h-full flex items-center justify-center"
                        transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 25,
                        }}>
                        <RedoIcon />
                    </motion.div>
                    {/* {menu && <span>Redo</span>} */}
                </Button>
            </Tip>
        </ButtonGroup>
    );
}
