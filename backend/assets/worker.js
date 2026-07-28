self.onmessage = async (e) => {
    const { taskId, inputData, module_ } = e.data;

    const encoder = new TextEncoder();
    const inputBuffer = encoder.encode(inputData + "\n");
    let inputIndex = 0;

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
            self.postMessage({ type: "stdout", taskId, content: text });
        },

        printErr: function (text) {
            // console.error(text);
            self.postMessage({ type: "stderr", taskId, content: text });
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
        self.postMessage({ type: "status", taskId, content: "exit" });
    } catch (err) {
        self.postMessage({ type: "error", taskId, content: err.message });
    }
};
