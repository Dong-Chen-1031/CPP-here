import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import Tip from "../ui/tips";

export interface EditDialogOptions {
  title?: string;
  name?: string;
  input?: string;
  expected?: string;
  submitBtnName?: string;
  tip?: string;
  handleSubmit?: (name: string, input: string, expected: string) => void;
}

export default function TestEditDialog({
  trigger,
  title,
  name,
  input = "",
  expected = "",
  tip = "",
  submitBtnName,
  handleSubmit = (n, i, e) => {
    console.log(n, i, e);
  },
}: EditDialogOptions & { trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const caseNameRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const expectedRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation(["editor", "common"]);

  if (!submitBtnName) {
    submitBtnName = t("common:create");
  }
  if (!title) {
    title = t("testCase.editDialog.titleCreate");
  }

  function handleSubmitWrapper() {
    const name = caseNameRef.current?.value || "";
    const input = inputRef.current?.value || "";
    const expected = expectedRef.current?.value || "";
    handleSubmit(name, input, expected);
    setOpen(false);
  }

  function handleDialogKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      handleSubmitWrapper();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tip ? (
        <Tip label={tip}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        </Tip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent
        className="md:max-w-125"
        showCloseButton={false}
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader className="p-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FieldGroup className="p-2">
          <Field>
            <Label>{t("testCase.editDialog.caseNameLabel")}</Label>
            <Input
              id="name-1"
              name="name"
              defaultValue={name}
              ref={caseNameRef}
              onFocus={(e) => {
                window.innerWidth > 768 && e.target.select();
              }}
            />
          </Field>
          <Field>
            <Label>{t("testCase.editDialog.inputLabel")}</Label>
            <Textarea
              className="h-30"
              name="input"
              placeholder={t("testCase.editDialog.inputPlaceholder")}
              defaultValue={input}
              autoFocus
              onFocus={(e) => {
                window.innerWidth > 768 && e.target.select();
              }}
              ref={inputRef}
            />
          </Field>
          <Field>
            <Label>{t("testCase.editDialog.expectedOutputLabel")}</Label>
            <Textarea
              className="h-30"
              name="expected"
              defaultValue={expected}
              placeholder={t("testCase.editDialog.expectedPlaceholder")}
              ref={expectedRef}
            />
          </Field>
        </FieldGroup>

        <DialogFooter className="border-t-border p-4">
          <Tip
            content={
              <>
                {t("common:cancel")} <Kbd>Esc</Kbd>
              </>
            }
          >
            <DialogClose asChild>
              <Button variant="outline">{t("common:cancel")}</Button>
            </DialogClose>
          </Tip>

          <Tip
            content={
              <>
                {t("common:save")}{" "}
                {navigator.platform.includes("Mac") ? (
                  <Kbd>⌘</Kbd>
                ) : (
                  <Kbd>Ctrl</Kbd>
                )}
                {""}
                <Kbd>⏎</Kbd>
              </>
            }
          >
            <Button onClick={handleSubmitWrapper}>{submitBtnName}</Button>
          </Tip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
