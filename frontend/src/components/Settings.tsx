import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { settingsPanelStore } from "@/store/atom";
import { useAtom } from "jotai";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useTranslation } from "react-i18next";

interface SettingsProps {
  allLangs: Record<string, string>;
}

export function Settings({ allLangs }: SettingsProps) {
  const [open, setOpen] = useAtom(settingsPanelStore);
  const { t, i18n } = useTranslation("editor");

  const handleLanguageChange = (newLang: string | null) => {
    if (newLang) {
      i18n.changeLanguage(allLangs[newLang]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-100 w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          {/* <DialogDescription>
            This is a dialog with scrollable content.
          </DialogDescription> */}
        </DialogHeader>
        <FieldSet>
          <FieldGroup>
            <Field orientation="horizontal" className="items-center">
              <FieldContent>
                <FieldLabel>{t("settings.language")}</FieldLabel>
                {/* <FieldDescription></FieldDescription> */}
              </FieldContent>
              <Combobox
                items={Object.keys(allLangs)}
                onValueChange={handleLanguageChange}
                value={
                  Object.keys(allLangs).find(
                    (code: string) => allLangs[code] === i18n.language,
                  ) || null
                }
              >
                <ComboboxInput placeholder={t("settings.selectLanguage")} />
                <ComboboxContent>
                  <ComboboxEmpty>{t("settings.noLanguage")}</ComboboxEmpty>
                  <ComboboxList>
                    {(item) => (
                      <ComboboxItem key={item} value={item}>
                        {item}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
          </FieldGroup>
        </FieldSet>
      </DialogContent>
    </Dialog>
  );
}
