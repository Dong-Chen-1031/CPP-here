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
    console.error("Build failed with errors:", respond.data.errors[0]);
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

export async function runCode(
  jsCode: string,
  wasmUrl: string,
  inputData: string,
) {
  const worker = new Worker(await text2BlobUrl(jsCode));
  const wasmResponse = await fetch(wasmUrl);
  const wasmModule = await WebAssembly.compileStreaming(wasmResponse);
  const taskId = crypto.randomUUID();
  worker.postMessage({
    taskId: taskId,
    inputData: inputData,
    module_: wasmModule,
  });
}
