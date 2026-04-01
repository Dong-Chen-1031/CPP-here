import { Button } from "@/components/ui/button";
import {
  CirclePlus,
  TestTubes,
  Trash,
  Pencil,
  Play,
  CircleCheckBig,
} from "lucide-react";
import { useEffect } from "react";

import Tip from "../ui/tips";
import { getDefaultStore, useAtom } from "jotai";
import {
  alertDialogStore,
  alertStore,
  inputStore,
  panelDrawerStore,
  runStatusStore,
  testCaseEditStore,
  testCasesStore,
  verifyJwtStore,
  type TestCase,
} from "@/store/atom";
import { cn, useIsMobile } from "@/lib/utils";
import { handleRun } from "@/api/run";
import { useTranslation } from "react-i18next";
import TestEditDialog from "./TestEditDialog";

interface Test {
  input: string;
  output: string;
}
enum TestType {
  Single = "single",
  MultiNumber = "multiNumber",
}

interface OutputConfiguration {
  type: "stdout" | "file";
  fileName?: string;
}

interface LanguageConfiguration {
  java: JavaConfiguration;
}

interface JavaConfiguration {
  mainClass: string;
  taskClass: string;
}

interface InputConfiguration {
  type: "stdin" | "file" | "regex";
  fileName?: string;
  pattern?: string;
}

interface OutputConfiguration {
  type: "stdout" | "file";
  fileName?: string;
}
interface Batch {
  id: string;
  size: number;
}

interface extTestCase {
  name: string;
  group: string;
  url: string;
  interactive: boolean;
  memoryLimit: number;
  timeLimit: number;
  tests: Test[];
  testType: TestType;
  input: InputConfiguration;
  output: OutputConfiguration;
  languages: LanguageConfiguration;
  batch: Batch;
}

export default function TestCasePanel({
  drawer = false,
}: {
  drawer?: boolean;
}) {
  const [, setInput] = useAtom(inputStore);
  const [testCases, setTestCases] = useAtom(testCasesStore);
  const [, setPanel] = useAtom(panelDrawerStore);
  const [, setAlertDialog] = useAtom(alertDialogStore);
  const isMobile = useIsMobile();
  const [jwt] = useAtom(verifyJwtStore);
  const { t } = useTranslation(["editor", "common"]);
  const defaultStore = getDefaultStore();
  const [, setAlert] = useAtom(alertStore);

  const [runStatus] = useAtom(runStatusStore);
  const [, setTestCaseEditArgs] = useAtom(testCaseEditStore);

  useEffect(() => {
    const handleExtEvent = (event: Event) => {
      const testCases = defaultStore.get(testCasesStore);
      const alertDialogDescription = t(
        "testCase.extension.alertDialog.description",
        {
          problemName: "||||",
        },
      ).split("||||");
      const testCaseData = (event as CustomEvent<extTestCase>).detail;
      const testCasesFromExtension: TestCase[] = testCaseData.tests.map(
        (test, index) => ({
          id: crypto.randomUUID(),
          name: t("testCase.extension.caseName", {
            problemName: testCaseData.name,
            index: index + 1,
          }),
          input: test.input,
          expectedOutput: test.output,
        }),
      );
      console.log("Received ext event with payload:", testCaseData);
      // console.log(testCases);
      if (testCases.length === 0) {
        setTestCases(testCasesFromExtension);
        setAlert((p) => [
          ...p,
          {
            id: crypto.randomUUID(),
            title: t("testCase.extension.alert.title"),
            description: t("testCase.extension.alert.description", {
              problemName: testCaseData.name,
            }),
            icon: <CircleCheckBig className="w-4 h-4" />,
          },
        ]);
        if (isMobile) {
          setPanel("testCases");
        }
        return;
      }
      setAlertDialog({
        title: t("testCase.extension.alertDialog.title"),
        descriptionNode: (
          <>
            {alertDialogDescription[0]}
            <code>{testCaseData.name}</code>
            {alertDialogDescription[1]}
          </>
        ),
        actions: [
          {
            text: t("testCase.extension.alertDialog.overwrite"),
            onClick: () => {
              setTestCases(testCasesFromExtension);
              if (isMobile) {
                setPanel("testCases");
              }
            },
          },
          {
            text: t("testCase.extension.alertDialog.insert"),
            autoFocus: true,
            onClick: () => {
              setTestCases((prev) => [...testCasesFromExtension, ...prev]);
              if (isMobile) {
                setPanel("testCases");
              }
            },
          },
        ],
        cancelText: t("testCase.extension.alertDialog.cancel"),
      });
    };
    window.addEventListener("ext", handleExtEvent);

    // this is used by the extension to check if the event listener is loaded
    // don't remove this or the extension won't work
    // @ts-ignore
    window.eventListenerLoaded = true;
    return () => {
      window.removeEventListener("ext", handleExtEvent);
    };
  }, []);
  function handleAddTestCase(name: string, input: string, expected: string) {
    const newTestCase: TestCase = {
      id: crypto.randomUUID(),
      name,
      input,
      expectedOutput: expected,
    };
    setTestCases((prev) => [...prev, newTestCase]);
  }
  const cantRun = runStatus !== "idle" || !jwt;

  return (
    <>
      <div
        className={cn(
          "p-4 border-border border-2 rounded-md h-full @container",
        )}
      >
        <div className="flex gap-2 items-center">
          <TestTubes className="w-3 h-3 shrink-0" />
          <p className="text-sm truncate">{t("testCase.label")}</p>
          <div className="flex-1"></div>
          <Tip>
            <Button
              variant="outline"
              className="px-2"
              onClick={(e) => {
                e.stopPropagation();
                setTestCaseEditArgs({
                  open: true,
                  name: t("testCase.defaultName", {
                    index: testCases.length + 1,
                  }),
                  handleSubmit: handleAddTestCase,
                });
              }}
            >
              <CirclePlus className="w-4 h-4" />
              <span className="hidden @[250px]:inline">
                {t("testCase.addBtn")}
              </span>
            </Button>
          </Tip>
        </div>
        <div className="mt-4 overflow-y-auto max-h-[calc(100%-2rem)]">
          {testCases.length === 0 ? (
            <p className="text-sm text-muted-foreground pl-2">
              {t("testCase.noTestCase")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {testCases.map((testCase) => (
                <div
                  key={testCase.id}
                  className="text-sm bg-accent/75 p-2 rounded-md cursor-pointer hover:bg-accent flex items-center justify-between gap-2"
                  onClick={() => {
                    setInput(testCase.input);
                    isMobile && setPanel("input");
                  }}
                >
                  <Tip label={t("testCase.setInputTip")}>
                    <p className="flex-1 truncate">{testCase.name}</p>
                  </Tip>
                  <Tip label={t("testCase.runTip")}>
                    <div className={cantRun ? "cursor-default" : ""}>
                      <Button
                        variant="outline"
                        size="icon"
                        // className="disabled:cursor-default!"
                        disabled={cantRun}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRun({ input: testCase.input });
                        }}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    </div>
                  </Tip>
                  <Tip label={t("testCase.editTip")}>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTestCaseEditArgs({
                          open: true,
                          title: t("testCase.editDialog.title"),
                          name: testCase.name,
                          input: testCase.input,
                          expected: testCase.expectedOutput,
                          submitBtnName: t("testCase.editDialog.saveBtn"),
                          handleSubmit: (name, input, expected) => {
                            setTestCases((prev) =>
                              prev.map((tc) =>
                                tc.id === testCase.id
                                  ? {
                                      ...tc,
                                      name,
                                      input,
                                      expectedOutput: expected,
                                    }
                                  : tc,
                              ),
                            );
                          },
                        });
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </Tip>

                  <Tip label={t("testCase.deleteTip")}>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTestCases((prev) =>
                          prev.filter((tc) => tc.id !== testCase.id),
                        );
                      }}
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </Tip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
