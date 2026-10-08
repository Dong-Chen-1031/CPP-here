import { browserBuild } from "../../src/service/browserBuild";
const api = {
    compileLocal: browserBuild,
    run: (module: WebAssembly.Module, input: string, timeout = 10_000) =>
        new Promise((resolve) => {
            const worker = new Worker(
                new URL(
                    "../../src/compiler/runtime.worker.ts",
                    import.meta.url,
                ),
                { type: "module" },
            );
            let stdout = "",
                stderr = "";
            const finish = (status: string) => {
                clearTimeout(timer);
                worker.terminate();
                resolve({ status, stdout, stderr });
            };
            const timer = setTimeout(() => finish("limit:time"), timeout);
            worker.onerror = (e) => finish("error:" + e.message);
            worker.onmessage = ({ data }) => {
                if (data.type === "stdout") stdout += data.content;
                if (data.type === "stderr") stderr += data.content;
                if (data.type === "error") finish("error:" + data.content);
                if (data.type === "limit") finish("limit:" + data.content);
                if (data.type === "status" && data.content === "exit")
                    finish("exit");
            };
            worker.postMessage({ module_: module, inputData: input });
        }),
};
(window as any).compilerTest = api;
