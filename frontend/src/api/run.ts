import config from "@/config/constants";
import axios from "axios";

interface BuildResponse {
  ok: boolean;
  js_url: string;
  wasm_url: string;
  errors: string[];
  js_code: string;
}

export async function buildCode(code: string, cppVersion: string) {
  const respond = await axios.post(`${config.api_endpoints}/build`, {
    code: code,
    cpp_version: cppVersion,
  });
  if (!respond.data.ok) {
    console.log("Build failed with errors:", respond.data.errors[0]);
  }
  return respond.data as BuildResponse;
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
  const blob = new Blob([code], { type: type });
  return URL.createObjectURL(blob);
}

interface RunOptions {
  onStdout?: (output: string) => void;
  onError?: (error: string) => void;
  onInit?: () => void;
  onStderr?: (stderr: string) => void;
  onEvent?: (event: any) => void;
  onExit?: () => void;
}

export async function runCode(
  jsCode: string,
  wasmUrl: string,
  inputData: string,
  {
    onStdout = (out) => {
      console.log("Standard output:", out);
    },
    onError = (err) => {
      console.error("Error:", err);
    },
    onInit = () => {
      console.log("Execution started.");
    },
    onStderr = (err) => {
      console.error("Standard error occurred.", err);
    },
    onEvent,
    onExit = (): void => {
      console.log("Execution completed.");
    },
  }: RunOptions,
) {
  const blobUrl = await text2BlobUrl(jsCode);
  const worker = new Worker(blobUrl);
  URL.revokeObjectURL(blobUrl);

  const wasmResponse = await fetch(wasmUrl);
  const wasmModule = await WebAssembly.compileStreaming(wasmResponse);
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
