const FLUSH_BYTES = 64 * 1024;
const FLUSH_INTERVAL_MS = 50;

self.onmessage = async (e) => {
    const { taskId, inputData, module_ } = e.data;

    const encoder = new TextEncoder();
    const inputBuffer = encoder.encode(inputData + "\n");
    let inputIndex = 0;

    let pending = [];
    let pendingType = "stdout";
    let pendingBytes = 0;
    let lastFlush = performance.now();

    function flush() {
        if (pending.length) {
            self.postMessage({
                type: pendingType,
                taskId,
                content: pending.join(""),
            });
        }
        pending = [];
        pendingBytes = 0;
        lastFlush = performance.now();
    }

    function write(type, text) {
        if (type !== pendingType) {
            flush();
            pendingType = type;
        }
        pending.push(text);
        pendingBytes += text.length;
        if (
            pendingBytes >= FLUSH_BYTES ||
            performance.now() - lastFlush >= FLUSH_INTERVAL_MS
        ) {
            flush();
        }
    }

    const wasmConfig = {
        instantiateWasm: function (imports, successCallback) {
            WebAssembly.instantiate(module_, imports)
                .then((instance) => {
                    successCallback(instance, module_);
                })
                .catch((err) => {
                    self.postMessage({
                        type: "error",
                        taskId,
                        content: err.message,
                    });
                });
            return {};
        },
        print: function (text) {
            write("stdout", text);
        },

        printErr: function (text) {
            if (text.startsWith("Aborted(")) return;
            write("stderr", text);
        },

        stdin: function () {
            if (inputIndex < inputBuffer.length) {
                return inputBuffer[inputIndex++];
            }
            return null;
        },
        onRuntimeInitialized: function () {
            self.postMessage({ type: "status", taskId, content: "Running" });
        },
    };

    try {
        const instance = await createMyModule(wasmConfig);
        flush();
        self.postMessage({ type: "status", taskId, content: "exit" });
    } catch (err) {
        flush();
        const message = String(err?.message ?? err);
        if (message.includes("Output Limit Exceeded")) {
            self.postMessage({ type: "limit", taskId, content: "output" });
        } else if (/Cannot enlarge memory|\(OOM\)/.test(message)) {
            self.postMessage({ type: "limit", taskId, content: "memory" });
        } else {
            self.postMessage({ type: "error", taskId, content: message });
        }
    }
};
