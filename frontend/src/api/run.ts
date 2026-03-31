import config from "@/config/constants";
import {
  alertStore,
  codeStore,
  codeWorkersStore,
  cppVersionStore,
  editorErrorStore,
  inputStore,
  outputStore,
  panelDrawerStore,
  runStatusStore,
  testCasesStore,
  turnstileRefStore,
  verifyJwtStore,
  type OutputCase,
} from "@/store/atom";
import axios from "axios";
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

    const respond = await axios.post(
      `${config.api_endpoints}/build`,
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
      defaultStore.set(alertStore, (p) => [
        ...p,
        {
          title: "Unauthorized",
          description:
            "Your verification has expired and will be automatically renewed. Please try running your code again.",
          variant: "destructive",
          id: crypto.randomUUID(),
        },
      ]);
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
  const response = await axios.get(url);
  const code = response.data;
  return text2BlobUrl(code, type);
}

interface RunOptions {
  onStdout?: (output: string) => void;
  onError?: (error: string) => void;
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
    this.running = false;
    defaultStore.set(codeWorkersStore, (prev) =>
      prev.filter((w) => w !== this),
    );
  }
}

export async function runCode(
  jsCode: string,
  inputData: string,
  {
    onStdout,
    onError,
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
        throw new Error("You must provide either wasmUrl or wasmModule.");
      }
      const wasmResponse = await fetch(wasmUrl);
      wasmModule = await WebAssembly.compileStreaming(wasmResponse);
    }
    const worker = new CodeWorker({ jsCode });
    const taskId = crypto.randomUUID();
    worker.onerror = (event) => {
      worker.terminate();
      onError && onError(event.message);
      onExit && onExit();
    };
    worker.onmessage = (event) => {
      // console.log("Worker message received:", event.data);
      onEvent && onEvent(event);
      const { type, content } = event.data;
      switch (type) {
        case "stdout":
          onStdout && onStdout(content);
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
              console.warn("Unknown status from worker:", content);
          }
          break;
        case "stderr":
          onStderr && onStderr(content);
          // onExit && onExit();
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

  store.set(alertStore, (p) => [
    ...p,
    {
      title,
      description,
      variant: "destructive",
      id: crypto.randomUUID(),
    },
  ]);

  const outputItem: OutputCase = {
    type: "err",
    content: err,
    testCaseId: options?.testCaseId,
    testCaseName: options?.testCaseName,
  };

  store.set(outputStore, (prev) => {
    if (options?.replaceOutput) return [outputItem];
    if (options?.testCaseId) {
      return insertInOrder(prev, outputItem);
    } else {
      return [...prev, outputItem];
    }
  });
}

export async function handleRun({
  code,
  input,
}: { code?: string; input?: string } = {}) {
  code = code ?? store.get(codeStore);
  input = input ?? store.get(inputStore);
  const cppVersion = store.get(cppVersionStore);

  store.set(runStatusStore, "building");
  store.set(editorErrorStore, []);
  store.set(outputStore, []);
  window.screen.width < 768 && store.set(panelDrawerStore, "output");

  const response = await buildCode(code, cppVersion);

  if (!response.ok || !response.js_code) {
    showError("Build failed with errors:\n" + response.errors[0], {
      title: "Build Failed",
      description: "Failed to build the code. Please check output for details.",
      replaceOutput: true,
    });
    store.set(runStatusStore, "idle");
    return;
  }

  runCode(response.js_code, input, {
    wasmUrl: response.wasm_url,
    onStdout: (output) => {
      store.set(outputStore, (prev) => [
        { content: (prev[prev.length - 1]?.content || "") + output + "\n" },
      ]);
    },
    onError(error) {
      showError(error, {
        title: "Runtime Error",
        description:
          "An error occurred during code execution. Please check output for details.",
      });
    },
    onExit() {
      store.set(runStatusStore, "idle");
    },
  });
  store.set(runStatusStore, "running");
}

function insertInOrder(prev: OutputCase[], item: OutputCase) {
  // console.log("Inserting output item:", item);
  const testCases = store.get(testCasesStore);

  const lastSameIdx = prev.findLastIndex(
    (o) => o.testCaseId === item.testCaseId && o.type === item.type,
  );
  if (lastSameIdx !== -1) {
    const merged = {
      ...prev[lastSameIdx],
      content:
        item.content !== ""
          ? prev[lastSameIdx].content + "\n" + item.content
          : prev[lastSameIdx].content,
      status: item.status ?? prev[lastSameIdx].status,
    };
    return [
      ...prev.slice(0, lastSameIdx),
      merged,
      ...prev.slice(lastSameIdx + 1),
    ];
  }

  const orderedIds = testCases.map((tc) => tc.id);

  const insertIdx = orderedIds.indexOf(item.testCaseId!);
  let pos = prev.length;
  for (let i = prev.length - 1; i >= 0; i--) {
    const idx = orderedIds.indexOf(prev[i].testCaseId!);
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
  // let exitCount = 0;

  if (testCases.length === 0) {
    store.set(alertStore, (p) => [
      ...p,
      {
        title: "No Test Cases",
        description:
          "There are no test cases to run. Please add some test cases first.",
        variant: "destructive",
        id: crypto.randomUUID(),
      },
    ]);
    return;
  }
  store.set(runStatusStore, "building");
  store.set(editorErrorStore, []);
  store.set(outputStore, []);
  window.screen.width < 768 && store.set(panelDrawerStore, "output");

  const response = await buildCode(code, cppVersion);
  if (!response.ok || !response.js_code || !response.wasm_url) {
    showError("Build failed with errors:\n" + response.errors[0], {
      title: "Build Failed",
      description: "Failed to build the code. Please check output for details.",
      replaceOutput: true,
    });
    store.set(runStatusStore, "idle");
    return;
  }
  const wasmModule = await url2WasmModule(response.wasm_url);

  // exitCount = 0;

  for (const testCase of testCases) {
    runCode(response.js_code, testCase.input, {
      wasmModule: wasmModule,
      onStdout(output) {
        store.set(outputStore, (prev) =>
          insertInOrder(prev, {
            content: output,
            testCaseId: testCase.id,
            testCaseName: testCase.name,
            status: "running",
          }),
        );
      },
      onError(error) {
        showError(error, {
          testCaseId: testCase.id,
          testCaseName: testCase.name,
        });
      },
      onExit() {
        let status: "finished" | "running" | "error" | "ac" | "wa" = "finished";
        if (testCase.expectedOutput) {
          const currentOutput = store
            .get(outputStore)
            .filter((o) => o.testCaseId === testCase.id)
            .map((o) => o.content.trim())
            .join("\n");
          // console.log(
          //   `Test case "${testCase.name}" expected output:`,
          //   testCase.expectedOutput,
          // );
          // console.log(
          //   `Test case "${testCase.name}" actual output:`,
          //   currentOutput,
          // );
          if (currentOutput === testCase.expectedOutput.trim()) {
            status = "ac";
          } else {
            status = "wa";
          }
        }
        store.set(outputStore, (prev) =>
          insertInOrder(prev, {
            content: "",
            testCaseId: testCase.id,
            testCaseName: testCase.name,
            status: status,
          }),
        );
        if (defaultStore.get(codeWorkersStore).length === 0) {
          store.set(runStatusStore, "idle");
        }
      },
    });
  }
  store.set(runStatusStore, "running");
}
