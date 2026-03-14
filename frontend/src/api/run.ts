import config from "@/config/constants";
import {
  alertStore,
  codeStore,
  cppVersionStore,
  inputStore,
  outputStore,
  runStatusStore,
  testCasesStore,
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
  try {
    const blobUrl = await text2BlobUrl(jsCode);
    const worker = new Worker(blobUrl);
    URL.revokeObjectURL(blobUrl);
    if (!wasmModule) {
      if (!wasmUrl) {
        throw new Error("Either wasmUrl or wasmModule must be provided");
      }
      const wasmResponse = await fetch(wasmUrl);
      wasmModule = await WebAssembly.compileStreaming(wasmResponse);
    }
    const taskId = crypto.randomUUID();
    worker.onerror = (event) => {
      worker.terminate();
      onError && onError(event.message);
    };
    worker.onmessage = (event) => {
      console.log("Worker message received:", event.data);
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
          onExit && onExit();
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

export async function handleRun({
  code,
  input,
}: { code?: string; input?: string } = {}) {
  code = code ?? store.get(codeStore);
  input = input ?? store.get(inputStore);
  const cppVersion = store.get(cppVersionStore);

  store.set(runStatusStore, "building");

  const response = await buildCode(code, cppVersion);

  if (!response.ok || !response.js_code) {
    store.set(outputStore, [
      {
        type: "err",
        content: "Build failed with errors:\n" + response.errors[0],
      },
    ]);
    store.set(alertStore, (p) => [
      ...p,
      {
        title: "Build Failed",
        description:
          "Failed to build the code. Please check output for details.",
        variant: "destructive",
        id: crypto.randomUUID(),
      },
    ]);

    store.set(runStatusStore, "idle");
    return;
  }

  runCode(response.js_code, input, {
    wasmUrl: response.wasm_url,
    onInit: () => {
      store.set(outputStore, []);
    },
    onStdout: (output) => {
      store.set(outputStore, (prev) => [
        { content: (prev[prev.length - 1]?.content || "") + output + "\n" },
      ]);
    },
    onError(error) {
      store.set(outputStore, (prev) => [
        ...prev,
        { type: "err", content: error },
      ]);
      store.set(alertStore, (p) => [
        ...p,
        {
          title: "Runtime Error",
          description:
            "An error occurred during code execution. Please check output for details.",
          variant: "destructive",
          id: crypto.randomUUID(),
        },
      ]);
    },
    onExit() {
      store.set(runStatusStore, "idle");
    },
  });
  store.set(runStatusStore, "running");
}

function insertInOrder(prev: OutputCase[], item: OutputCase) {
  const testCases = store.get(testCasesStore);

  const lastSameIdx = prev.findLastIndex(
    (o) => o.testCaseId === item.testCaseId && o.type === item.type,
  );
  if (lastSameIdx !== -1) {
    const merged = {
      ...prev[lastSameIdx],
      content: prev[lastSameIdx].content + "\n" + item.content,
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
  let exitCount = 0;

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
  const response = await buildCode(code, cppVersion);
  if (!response.ok || !response.js_code || !response.wasm_url) {
    store.set(outputStore, [
      {
        type: "err",
        content: "Build failed with errors:\n" + response.errors[0],
      },
    ]);
    store.set(alertStore, (p) => [
      ...p,
      {
        title: "Build Failed",
        description:
          "Failed to build the code. Please check output for details.",
        variant: "destructive",
        id: crypto.randomUUID(),
      },
    ]);
    store.set(runStatusStore, "idle");
    return;
  }
  const wasmModule = await url2WasmModule(response.wasm_url);
  store.set(outputStore, []);
  exitCount = 0;

  for (const testCase of testCases) {
    runCode(response.js_code, testCase.input, {
      wasmModule: wasmModule,
      onStdout(output) {
        store.set(outputStore, (prev) =>
          insertInOrder(prev, {
            content: output,
            testCaseId: testCase.id,
            testCaseName: testCase.name,
          }),
        );
      },
      onError(error) {
        store.set(outputStore, (prev) =>
          insertInOrder(prev, {
            type: "err",
            content: error,
            testCaseId: testCase.id,
            testCaseName: testCase.name,
          }),
        );
        store.set(alertStore, (p) => [
          ...p,
          {
            title: `Runtime Error in ${testCase.name}`,
            description:
              "An error occurred during code execution. Please check output for details.",
            variant: "destructive",
            id: crypto.randomUUID(),
          },
        ]);
      },
      onExit() {
        exitCount += 1;
        console.log(
          `Test case ${testCase.name} completed. (${exitCount}/${testCases.length})`,
        );
        if (exitCount === testCases.length) {
          store.set(runStatusStore, "idle");
        }
      },
    });
  }
  store.set(runStatusStore, "running");
}
