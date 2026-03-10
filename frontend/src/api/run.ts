import config from "@/config/constants";
import { verifyJwtStore } from "@/store/atom";
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
}
