import {
    codeStore,
    codeWorkersStore,
    cppVersionStore,
    editorErrorStore,
    inputStore,
    panelDrawerStore,
    runStatusStore,
    testCasesStore,
    turnstileRefStore,
    verifyJwtStore,
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
    parseTimeLimit,
} from "@/config/runLimits";
import { timeLimitStore } from "@/store/configStore";
import i18next from "i18next";
import { PUBLIC_API_URL } from "astro:env/client";
import { apiAxios, axios } from "@/lib/axiosInstance";
import { addAlert } from "@/lib/alert";
import { getDefaultStore } from "jotai";
interface BuildResponse {
    ok: boolean;
    js_url?: string;
    wasm_url?: string;
    errors: string[];
    js_code?: string;
}

const defaultStore = getDefaultStore();

export async function buildCode(code: string, cppVersion: string) {
    try {
        const jwt = defaultStore.get(verifyJwtStore) || "";
        // console.log("JWT for build request:", jwt);

        const respond = await apiAxios.post(
            `/build`,
            {
                code: code,
                cpp_version: cppVersion,
            },
            {
                headers: {
                    Authorization: `Bearer ${jwt}`,
                },
            },
        );
        return respond.data as BuildResponse;
    } catch (error) {
        console.error("Error during build request:", error);
        if (axios.isAxiosError(error) && error.status === 401) {
            defaultStore.set(verifyJwtStore, null);
            addAlert({
                title: "Unauthorized",
                description:
                    "Your verification has expired and will be automatically renewed. Please try running your code again.",
                variant: "destructive",
            });
            const turnstileRef = defaultStore.get(turnstileRefStore);
            turnstileRef?.current?.reset();

            await new Promise((resolve, reject) =>
                defaultStore.sub(verifyJwtStore, () => {
                    resolve(null);
                }),
            );

            return await buildCode(code, cppVersion);
        }
        return { ok: false, errors: [String(error)] } as BuildResponse;
    }
}

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

    constructor({ jsCode }: { jsCode: string }) {
        const blobUrl = URL.createObjectURL(
            new Blob([jsCode], { type: "application/javascript" }),
        );
        super(blobUrl);
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

/** The user's time limit in seconds, falling back to the default if invalid. */
function getTimeLimit() {
    return (
        parseTimeLimit(defaultStore.get(timeLimitStore)) ?? DEFAULT_TIME_LIMIT_S
    );
}

export async function runCode(
    jsCode: string,
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
        const errorMsg = "Web Workers are not supported in this environment.";
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
        const worker = new CodeWorker({ jsCode });
        const taskId = crypto.randomUUID();
        let receivedBytes = 0;

        const stopForLimit = (kind: LimitKind) => {
            worker.terminate();
            onLimit && onLimit(kind);
            onExit && onExit();
        };

        const timeLimit = getTimeLimit();
        if (timeLimit !== NO_TIME_LIMIT) {
            worker.timer = setTimeout(
                () => stopForLimit("time"),
                timeLimit * 1000,
            );
        }

        worker.onerror = (event) => {
            if (!worker.running) return;
            worker.terminate();
            onError && onError(event.message);
            onExit && onExit();
        };
        worker.onmessage = (event) => {
            if (!worker.running) return;
            onEvent && onEvent(event);
            const { type, content } = event.data;
            switch (type) {
                case "stdout":
                case "stderr":
                    receivedBytes += content.length;
                    if (receivedBytes > OUTPUT_LIMIT_BYTES) {
                        stopForLimit("output");
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
            ? `Runtime Error in ${options.testCaseName}`
            : "Error");
    const description =
        options?.description ||
        "An error occurred. Please check output for details.";

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

export async function handleRun({
    code,
    input,
}: { code?: string; input?: string } = {}) {
    code = code ?? store.get(codeStore);
    input = input ?? store.get(inputStore);
    const cppVersion = store.get(cppVersionStore);
    console.log(`Running code with C++ version: ${cppVersion}`);

    store.set(runStatusStore, "building");
    store.set(editorErrorStore, []);
    store.set(outputStore, []);
    await clearOutputBuffer();
    window.innerWidth < 768 && store.set(panelDrawerStore, "output");

    const response = await buildCode(code, cppVersion);

    if (!response.ok || !response.js_code) {
        window.posthog?.capture("code_build_failed", {
            cpp_version: cppVersion,
            mode: "single",
        });
        showError("Build failed with errors:\n" + response.errors[0], {
            title: "Build Failed",
            description:
                "Failed to build the code. Please check output for details.",
            replaceOutput: true,
        });
        store.set(runStatusStore, "idle");
        return;
    }

    window.posthog?.capture("code_run", {
        cpp_version: cppVersion,
    });

    const addSingleOutput = (type: "stdout" | "stderr", content: string) => {
        addOutputChunk(SINGLE_CASE_ID, { type, content });
        if (store.get(outputStore).length === 0) {
            store.set(outputStore, [{ testCaseId: SINGLE_CASE_ID }]);
        }
    };

    runCode(response.js_code, input, {
        wasmUrl: response.wasm_url,
        onStdout: (output) => addSingleOutput("stdout", output),
        onStderr: (output) => addSingleOutput("stderr", output),
        onError(error) {
            showError(error, {
                title: "Runtime Error",
                description:
                    "An error occurred during code execution. Please check output for details.",
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

export async function handleRunAll() {
    const testCases = store.get(testCasesStore);
    const code = store.get(codeStore);
    const cppVersion = store.get(cppVersionStore);
    console.log(`Running code with C++ version: ${cppVersion}`);

    // let exitCount = 0;

    if (testCases.length === 0) {
        addAlert({
            title: "No Test Cases",
            description:
                "There are no test cases to run. Please add some test cases first.",
            variant: "destructive",
        });
        return;
    }
    store.set(runStatusStore, "building");
    store.set(editorErrorStore, []);
    store.set(outputStore, []);
    await clearOutputBuffer();
    window.innerWidth < 768 && store.set(panelDrawerStore, "output");

    const response = await buildCode(code, cppVersion);
    if (!response.ok || !response.js_code || !response.wasm_url) {
        window.posthog?.capture("code_build_failed", {
            cpp_version: cppVersion,
            mode: "all",
            test_case_count: testCases.length,
        });
        showError("Build failed with errors:\n" + response.errors[0], {
            title: "Build Failed",
            description:
                "Failed to build the code. Please check output for details.",
            replaceOutput: true,
        });
        store.set(runStatusStore, "idle");
        return;
    }

    window.posthog?.capture("code_run_all", {
        cpp_version: cppVersion,
        test_case_count: testCases.length,
    });

    const wasmModule = await url2WasmModule(response.wasm_url);

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
