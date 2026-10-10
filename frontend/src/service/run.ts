import { LOCAL_WORKER_MARKER } from "../compiler/config";
// `?worker&url` makes Vite bundle the worker; a bare new URL("….ts") inside
// super() is not recognized as one and would ship the TypeScript source.
import runtimeWorkerUrl from "../compiler/runtime.worker.ts?worker&url";
import {
    codeStore,
    codeWorkersStore,
    cppVersionStore,
    editorErrorStore,
    inputStore,
    panelDrawerStore,
    runStatusStore,
    testCasesStore,
} from "@/store/atom";
import {
    addOutputChunk,
    clearOutputBuffer,
    outputStore,
    type OutputCase,
} from "@/store/outputStore";
import {
    DEFAULT_TIME_LIMIT_S,
    MEMORY_LIMIT_MIB,
    NO_TIME_LIMIT,
    OUTPUT_LIMIT_BYTES,
} from "@/config/runLimits";
import { timeLimitStore } from "@/store/configStore";
import i18next from "i18next";
import { apiAxios } from "@/lib/axiosInstance";
import { addAlert } from "@/lib/alert";
import { getDefaultStore } from "jotai";
import { randomId } from "@/lib/utils";
import {
    build,
    cancelBuild,
    suggestOtherCompiler,
    type BuildTarget,
} from "./build";

const defaultStore = getDefaultStore();

async function text2BlobUrl(
    code: string,
    type: string = "application/javascript",
) {
    const blob = new Blob([code], { type: type });
    return URL.createObjectURL(blob);
}

async function url2BlobUrl(
    url: string,
    type: string = "application/javascript",
) {
    const response = await apiAxios.get(url);
    const code = response.data;
    return text2BlobUrl(code, type);
}

export type LimitKind = "time" | "output" | "memory";

interface RunOptions {
    onStdout?: (output: string) => void;
    onError?: (error: string) => void;
    onLimit?: (kind: LimitKind) => void;
    onInit?: () => void;
    onStderr?: (stderr: string) => void;
    onEvent?: (event: any) => void;
    onExit?: () => void;
    wasmUrl?: string;
    wasmModule?: WebAssembly.Module;
}

export async function url2WasmModule(url: string) {
    const response = await fetch(url);
    const wasmModule = await WebAssembly.compileStreaming(response);
    return wasmModule;
}

export class CodeWorker extends (typeof Worker !== "undefined"
    ? Worker
    : (class {
          constructor() {}
          postMessage() {}
          addEventListener() {}
          removeEventListener() {}
      } as typeof Worker)) {
    running: boolean = false;
    timer: ReturnType<typeof setTimeout> | null = null;

    constructor({ js_code }: { js_code: string }) {
        const blobUrl = URL.createObjectURL(
            new Blob([js_code], { type: "application/javascript" }),
        );
        super(
            js_code === LOCAL_WORKER_MARKER ? runtimeWorkerUrl : blobUrl,
            js_code === LOCAL_WORKER_MARKER ? { type: "module" } : undefined,
        );
        try {
            defaultStore.set(codeWorkersStore, (prev) => [...prev, this]);
            this.running = true;
        } catch (error) {
            console.error("Failed to create CodeWorker:", error);
            throw error;
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

    terminate() {
        super.terminate();
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.running = false;
        defaultStore.set(codeWorkersStore, (prev) =>
            prev.filter((w) => w !== this),
        );
    }
}

function getTimeLimit() {
    return Number(defaultStore.get(timeLimitStore)) || DEFAULT_TIME_LIMIT_S;
}

export async function runCode(
    js_code: string,
    inputData: string,
    {
        onStdout,
        onError,
        onLimit,
        onInit,
        onStderr = (err) => {
            console.error("Standard error occurred.", err);
        },
        onEvent,
        onExit,
        wasmUrl,
        wasmModule,
    }: RunOptions,
) {
    if (typeof Worker === "undefined") {
        const errorMsg = i18next.t("editor:run.workersUnsupported");
        console.error(errorMsg);
        onError && onError(errorMsg);
        onExit && onExit();
        return;
    }
    try {
        if (!wasmModule) {
            if (!wasmUrl) {
                throw new Error(
                    "You must provide either wasmUrl or wasmModule.",
                );
            }
            const wasmResponse = await fetch(wasmUrl);
            wasmModule = await WebAssembly.compileStreaming(wasmResponse);
        }
        const worker = new CodeWorker({ js_code });
        const taskId = randomId();
        let receivedBytes = 0;
        // Set between a TLE and reporting it, see stopForLimit
        let draining = false;

        const stopForLimit = (kind: LimitKind) => {
            if (kind !== "time") {
                worker.terminate();
                onLimit && onLimit(kind);
                onExit && onExit();
                return;
            }
            // Output the worker posted before the time limit may still be
            // queued on this thread (busy rendering earlier output), and
            // terminate() discards it. Let it through first, then stop.
            draining = true;
            setTimeout(() => {
                draining = false;
                // Stopped by the user in the meantime
                if (!worker.running) return;
                worker.terminate();
                onLimit && onLimit(kind);
                onExit && onExit();
            }, 0);
        };

        const timeLimit = getTimeLimit();
        if (timeLimit !== NO_TIME_LIMIT) {
            worker.timer = setTimeout(
                () => stopForLimit("time"),
                timeLimit * 1000,
            );
        }

        worker.onerror = (event) => {
            if (!worker.running || draining) return;
            worker.terminate();
            // A worker that fails to load has no message.
            onError && onError(event.message || "Failed to start the program.");
            onExit && onExit();
        };
        worker.onmessage = (event) => {
            const { type, content } = event.data;
            if (!worker.running) return;
            // Past the time limit only output still counts: the TLE is
            // reported even if the program exits in the meantime
            if (draining && type !== "stdout" && type !== "stderr") return;
            onEvent && onEvent(event);
            switch (type) {
                case "stdout":
                case "stderr":
                    receivedBytes +=
                        event.data.byteLength ??
                        (js_code === LOCAL_WORKER_MARKER
                            ? new TextEncoder().encode(content).length
                            : content.length);
                    if (receivedBytes > OUTPUT_LIMIT_BYTES) {
                        // While draining the TLE is reported anyway
                        if (!draining) stopForLimit("output");
                        break;
                    }
                    if (type === "stdout") onStdout && onStdout(content);
                    else onStderr && onStderr(content);
                    break;
                case "limit":
                    stopForLimit(content);
                    break;
                case "error":
                    worker.terminate();
                    onError && onError(content);
                    onExit && onExit();

                    break;
                case "status":
                    switch (content) {
                        case "Running":
                            onInit && onInit();
                            break;
                        case "exit":
                            worker.terminate();
                            onExit && onExit();
                            break;
                        default:
                            console.warn(
                                "Unknown status from worker:",
                                content,
                            );
                    }
                    break;
                default:
                    console.warn("Unknown status from worker:", content);
            }
        };
        worker.postMessage({
            taskId: taskId,
            inputData: inputData,
            module_: wasmModule,
        });
    } catch (error) {
        console.error("Error during code execution:", error);
        onError && onError(String(error));
        onExit && onExit();
    }
}

const store = getDefaultStore();

const SINGLE_CASE_ID = "single";

interface ShowErrorOptions {
    title?: string;
    description?: string;
    testCaseId?: string;
    testCaseName?: string;
    replaceOutput?: boolean;
}

export function showError(err: string, options?: ShowErrorOptions) {
    const regex = /:(\d+):(?:\d+:)?\s*(error|warning|fatal error):\s*(.*)/gi;
    const matches = [...err.matchAll(regex)];

    if (matches.length > 0) {
        const newErrors = matches.map((match) => {
            const line = parseInt(match[1], 10);
            const type = match[2].toLowerCase();
            const severity: "warning" | "error" = type.includes("warning")
                ? "warning"
                : "error";
            const msg = match[3];
            return { line, msg, severity };
        });

        store.set(editorErrorStore, (prev) => [...(prev || []), ...newErrors]);
    }

    const title =
        options?.title ||
        (options?.testCaseName
            ? i18next.t("editor:run.runtimeErrorIn", {
                  testCaseName: options.testCaseName,
              })
            : i18next.t("editor:run.errorTitle"));
    const description =
        options?.description || i18next.t("editor:run.errorDescription");

    addAlert({
        title,
        description,
        variant: "destructive",
    });

    const testCaseId = options?.testCaseId ?? SINGLE_CASE_ID;
    const prev = options?.replaceOutput ? [] : store.get(outputStore);
    const hasOutput = prev.some((o) => o.testCaseId === testCaseId);
    addOutputChunk(testCaseId, {
        type: "error",
        content: (hasOutput ? "\n" : "") + err,
    });
    store.set(
        outputStore,
        upsertCase(prev, {
            type: "err",
            testCaseId,
            testCaseName: options?.testCaseName,
            status: options?.testCaseId ? "error" : undefined,
        }),
    );
}

function showLimit(
    kind: LimitKind,
    options?: Pick<ShowErrorOptions, "testCaseId" | "testCaseName">,
) {
    const title = i18next.t(`editor:limit.${kind}.title`);
    const description = i18next.t(`editor:limit.${kind}.description`, {
        seconds: getTimeLimit(),
        size:
            kind === "memory"
                ? MEMORY_LIMIT_MIB
                : OUTPUT_LIMIT_BYTES / 1024 / 1024,
    });
    showError(`${title}: ${description}`, {
        ...options,
        title: options?.testCaseName
            ? `${title} (${options.testCaseName})`
            : title,
        description,
    });
}

type RunSingleOptions = { code?: string; input?: string; target?: BuildTarget };

/** Builds and runs the code with the current input. Never fails silently. */
export async function handleRun(options: RunSingleOptions = {}) {
    try {
        await runSingle(options);
    } catch (error) {
        reportUnexpected(error);
    }
}

/** Builds once and runs every test case. Never fails silently. */
export async function handleRunAll(options: { target?: BuildTarget } = {}) {
    try {
        await runAll(options);
    } catch (error) {
        reportUnexpected(error);
    }
}

function reportUnexpected(error: unknown) {
    console.error("Run failed unexpectedly:", error);
    defaultStore.get(codeWorkersStore).forEach((worker) => worker.terminate());
    store.set(runStatusStore, "idle");
    showError(String(error), {
        title: i18next.t("editor:run.unexpectedErrorTitle"),
        description: i18next.t("editor:run.unexpectedErrorDescription"),
    });
}

// Bumped by every run and by stopBuild: a run whose build finishes after
// that must not go on to execute.
let runGeneration = 0;

/** Stops the build in progress. Running programs stop with their workers. */
export function stopBuild() {
    if (store.get(runStatusStore) !== "building") return;
    runGeneration++;
    cancelBuild();
    store.set(runStatusStore, "idle");
    window.posthog?.capture("code_build_cancelled", {
        cpp_version: store.get(cppVersionStore),
    });
}

/** Whether the build was stopped; the run then ends quietly. */
function buildStopped(generation: number, cancelled?: boolean) {
    if (generation === runGeneration && !cancelled) return false;
    if (generation === runGeneration) store.set(runStatusStore, "idle");
    return true;
}

/**
 * Retries a failed build from an alert, unless a run has started since: that
 * one already builds the current code.
 */
function retryWhenIdle(run: () => Promise<void>) {
    if (store.get(runStatusStore) === "idle") {
        void run();
        return;
    }
    addAlert({
        title: i18next.t("editor:compiler.retryBusyTitle"),
        description: i18next.t("editor:compiler.retryBusyDescription"),
    });
}

function buildErrorText(errors: string[]) {
    return (
        errors.filter(Boolean).join("\n") ||
        i18next.t("editor:run.unknownBuildError")
    );
}

async function runSingle({ code, input, target }: RunSingleOptions) {
    code = code ?? store.get(codeStore);
    input = input ?? store.get(inputStore);
    const cppVersion = store.get(cppVersionStore);
    console.log(`Running code with C++ version: ${cppVersion}`);

    const generation = ++runGeneration;
    store.set(runStatusStore, "building");
    store.set(editorErrorStore, []);
    store.set(outputStore, []);
    await clearOutputBuffer();
    window.innerWidth < 768 && store.set(panelDrawerStore, "output");

    // Stopped before the build began
    if (generation !== runGeneration) return;
    const response = await build(code, cppVersion, target);
    if (buildStopped(generation, response.cancelled)) return;

    if (!response.ok || !response?.js_code) {
        window.posthog?.capture("code_build_failed", {
            cpp_version: cppVersion,
            mode: "single",
            compiler: response.target,
        });
        showError(
            i18next.t("editor:run.buildFailedOutput") +
                "\n" +
                buildErrorText(response.errors),
            {
                title: i18next.t("editor:run.buildFailedTitle"),
                description: i18next.t("editor:run.buildFailedDescription"),
                replaceOutput: true,
            },
        );
        store.set(runStatusStore, "idle");
        suggestOtherCompiler(response, (target) =>
            retryWhenIdle(() => handleRun({ input, target })),
        );
        return;
    }

    window.posthog?.capture("code_run", {
        cpp_version: cppVersion,
        compiler: response.target,
    });

    const addSingleOutput = (type: "stdout" | "stderr", content: string) => {
        addOutputChunk(SINGLE_CASE_ID, { type, content });
        if (store.get(outputStore).length === 0) {
            store.set(outputStore, [{ testCaseId: SINGLE_CASE_ID }]);
        }
    };

    runCode(response.js_code, input, {
        wasmUrl: response.wasm_url,
        wasmModule: response.wasmModule,
        onStdout: (output) => addSingleOutput("stdout", output),
        onStderr: (output) => addSingleOutput("stderr", output),
        onError(error) {
            showError(error, {
                title: i18next.t("editor:run.runtimeErrorTitle"),
                description: i18next.t("editor:run.runtimeErrorDescription"),
            });
        },
        onLimit(kind) {
            showLimit(kind);
        },
        onExit() {
            store.set(runStatusStore, "idle");
        },
    });
    store.set(runStatusStore, "running");
}

function upsertCase(prev: OutputCase[], item: OutputCase): OutputCase[] {
    const existingIdx = prev.findIndex((o) => o.testCaseId === item.testCaseId);
    if (existingIdx !== -1) {
        const existing = prev[existingIdx];
        const merged: OutputCase = {
            ...existing,
            type: item.type ?? existing.type,
            testCaseName: item.testCaseName ?? existing.testCaseName,
            status: item.status ?? existing.status,
        };
        return [
            ...prev.slice(0, existingIdx),
            merged,
            ...prev.slice(existingIdx + 1),
        ];
    }

    const orderedIds = store.get(testCasesStore).map((tc) => tc.id);

    const insertIdx = orderedIds.indexOf(item.testCaseId);
    let pos = prev.length;
    for (let i = prev.length - 1; i >= 0; i--) {
        const idx = orderedIds.indexOf(prev[i].testCaseId);
        if (idx <= insertIdx) {
            pos = i + 1;
            break;
        }
        pos = i;
    }
    return [...prev.slice(0, pos), item, ...prev.slice(pos)];
}

async function runAll({ target }: { target?: BuildTarget }) {
    const testCases = store.get(testCasesStore);
    const code = store.get(codeStore);
    const cppVersion = store.get(cppVersionStore);
    console.log(`Running code with C++ version: ${cppVersion}`);

    // let exitCount = 0;

    if (testCases.length === 0) {
        addAlert({
            title: i18next.t("editor:run.noTestCasesTitle"),
            description: i18next.t("editor:run.noTestCasesDescription"),
            variant: "destructive",
        });
        return;
    }
    const generation = ++runGeneration;
    store.set(runStatusStore, "building");
    store.set(editorErrorStore, []);
    store.set(outputStore, []);
    await clearOutputBuffer();
    window.innerWidth < 768 && store.set(panelDrawerStore, "output");

    // Stopped before the build began
    if (generation !== runGeneration) return;
    const response = await build(code, cppVersion, target);
    if (buildStopped(generation, response.cancelled)) return;
    if (
        !response.ok ||
        !response.js_code ||
        (!response.wasm_url && !response.wasmModule)
    ) {
        window.posthog?.capture("code_build_failed", {
            cpp_version: cppVersion,
            mode: "all",
            test_case_count: testCases.length,
            compiler: response.target,
        });
        showError(
            i18next.t("editor:run.buildFailedOutput") +
                "\n" +
                buildErrorText(response.errors),
            {
                title: i18next.t("editor:run.buildFailedTitle"),
                description: i18next.t("editor:run.buildFailedDescription"),
                replaceOutput: true,
            },
        );
        store.set(runStatusStore, "idle");
        suggestOtherCompiler(response, (target) =>
            retryWhenIdle(() => handleRunAll({ target })),
        );
        return;
    }

    window.posthog?.capture("code_run_all", {
        cpp_version: cppVersion,
        test_case_count: testCases.length,
        compiler: response.target,
    });

    const wasmModule =
        response.wasmModule ?? (await url2WasmModule(response.wasm_url));
    // Stopped while the wasm was fetched
    if (generation !== runGeneration) return;

    // exitCount = 0;

    for (const testCase of testCases) {
        let collected = "";
        let failed = false;
        const caseInfo = {
            testCaseId: testCase.id,
            testCaseName: testCase.name,
        };
        const addCaseOutput = (type: "stdout" | "stderr", content: string) => {
            addOutputChunk(testCase.id, { type, content });
            if (
                !store
                    .get(outputStore)
                    .some((o) => o.testCaseId === testCase.id)
            ) {
                store.set(outputStore, (prev) =>
                    upsertCase(prev, { ...caseInfo, status: "running" }),
                );
            }
        };
        runCode(response.js_code, testCase.input, {
            wasmModule: wasmModule,
            onStdout(output) {
                collected += output;
                addCaseOutput("stdout", output);
            },
            onStderr(output) {
                addCaseOutput("stderr", output);
            },
            onError(error) {
                failed = true;
                showError(error, caseInfo);
            },
            onLimit(kind) {
                failed = true;
                showLimit(kind, caseInfo);
            },
            onExit() {
                if (!failed) {
                    let status: "finished" | "ac" | "wa" = "finished";
                    if (testCase.expectedOutput) {
                        status =
                            collected.trim() === testCase.expectedOutput.trim()
                                ? "ac"
                                : "wa";
                    }
                    store.set(outputStore, (prev) =>
                        upsertCase(prev, { ...caseInfo, status }),
                    );
                }
                if (defaultStore.get(codeWorkersStore).length === 0) {
                    store.set(runStatusStore, "idle");
                }
            },
        });
    }
    store.set(runStatusStore, "running");
}
