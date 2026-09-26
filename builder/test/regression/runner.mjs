// Runs a compiled program exactly the way C++ Here's browser does: the backend
// appends backend/assets/worker.js to the program's JS (router/direct_api/
// build.py), the page starts it as a worker and posts it the compiled module
// and the input. Here the worker is a vm context that looks like a dedicated
// worker, driven through the real worker.js.
//
// Usage: node runner.mjs <program.js> <program.wasm> <worker.js> < input
// stdout: everything the program printed to stdout
// stderr: the program's stderr, then a last line "STATUS: <status>" where
//         <status> is exit | limit:output | limit:memory | error:<message>

import { readFileSync } from "node:fs";
import vm from "node:vm";

const [jsPath, wasmPath, workerPath] = process.argv.slice(2);
const inputData = readFileSync(0, "utf8");

const stdout = [];
const stderr = [];
let finish;
const finished = new Promise((resolve) => (finish = resolve));

// The output is built with -sENVIRONMENT=worker, so it refuses to run when it
// sees `process` (node) and requires WorkerGlobalScope
const context = vm.createContext({
    WorkerGlobalScope: function WorkerGlobalScope() {},
    location: { href: "file:///program.js" },
    console,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    performance,
    setTimeout,
    clearTimeout,
    URL,
    postMessage({ type, content }) {
        if (type === "stdout") stdout.push(content);
        else if (type === "stderr") stderr.push(content);
        else if (type === "status" && content === "exit") finish("exit");
        else if (type === "limit") finish(`limit:${content}`);
        else if (type === "error") finish(`error:${String(content).split("\n")[0]}`);
    },
});
context.self = context;

// Same concatenation as the backend
const program = readFileSync(jsPath, "utf8");
const worker = readFileSync(workerPath, "utf8");
vm.runInContext(`${program}\n\n// Worker code\n${worker}`, context, {
    filename: jsPath,
});

const module_ = await WebAssembly.compile(readFileSync(wasmPath));
context.self.onmessage({ data: { taskId: 1, inputData, module_ } });

const status = await finished;
process.stdout.write(stdout.join(""));
process.stderr.write(stderr.join("") + `\nSTATUS: ${status}\n`);
