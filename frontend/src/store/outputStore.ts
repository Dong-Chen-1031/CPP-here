import { atomWithStorage } from "jotai/utils";
import { Dexie, type EntityTable } from "dexie";
import htmlEscape from "escape-html";
import { OUTPUT_FLUSH_INTERVAL_MS } from "@/config/runLimits";

type OutputChunkType = "stdout" | "stderr" | "error";

interface outputChunkDB {
    id: number;
    testCaseId: string;
    type: OutputChunkType;
    content: string;
}

// The cache is off: Dexie 4.4.6's cache adds the result of every bulkAdd with
// auto-increment keys to its optimistic updates, and when every row fails
// (iOS Safari, see withReconnect) it adds null instead. From then on each
// liveQuery read and write transaction on the table throws "null is not an
// object (evaluating '$.trans')" until the page reloads, because the cache
// lives in Dexie's module and reopening the database does not clear it. Each
// liveQuery here reads a new range, so the cache saved nothing measurable.
export const outputdb = new Dexie("OutputDatabase", {
    cache: "disabled",
}) as Dexie & {
    outputChunks: EntityTable<outputChunkDB, "id">;
};

outputdb.version(1).stores({
    outputChunks: "++id,testCaseId,type,[testCaseId+id]",
});

export interface OutputCase {
    type?: "stdout" | "err";
    testCaseId: string;
    testCaseName?: string;
    expectedOutput?: string;
    // queued: "Run all" has not started the case yet
    status?: "queued" | "running" | "ac" | "error" | "wa" | "finished";
}

export type OutputChunk = {
    type: OutputChunkType;
    content: string;
};

export const outputStore = atomWithStorage<OutputCase[]>("output", []);

let pendingChunks: Omit<outputChunkDB, "id">[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function addOutputChunk(testCaseId: string, chunk: OutputChunk) {
    pendingChunks.push({
        testCaseId,
        type: chunk.type,
        content: chunk.content,
    });
    flushTimer ??= setTimeout(flushOutputChunks, OUTPUT_FLUSH_INTERVAL_MS);
}

// Writes run one at a time and in order: a batch retried after a reconnect
// must not land after a later batch, or a clear after it, as the output
// panel renders chunks in id order.
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
    const task = writeQueue.then(() => withReconnect(write));
    writeQueue = task.catch(() => {});
    return task;
}

// iOS Safari can break the IndexedDB connection while the page is in the
// background ("UnknownError: Attempt to generate key in database without an
// in-progress transaction"), and later writes fail until it is reopened.
const RECONNECT_ERRORS = new Set([
    "DatabaseClosedError",
    "InvalidStateError",
    "TransactionInactiveError",
    "UnknownError",
]);

function isConnectionError(e: unknown): boolean {
    if (!(e instanceof Error)) return false;
    const err = e as Error & { inner?: unknown; failures?: unknown[] };
    return (
        RECONNECT_ERRORS.has(err.name) ||
        isConnectionError(err.inner) ||
        (err.failures ?? []).some(isConnectionError)
    );
}

async function withReconnect<T>(write: () => Promise<T>): Promise<T> {
    try {
        return await write();
    } catch (e) {
        if (!isConnectionError(e)) throw e;
        console.warn("Output database failed, reopening it", e);
        outputdb.close({ disableAutoOpen: false });
        await outputdb.open();
        return write();
    }
}

// One transaction, so a failed batch writes no rows and can be retried whole.
function writeChunks(batch: Omit<outputChunkDB, "id">[]) {
    return outputdb.transaction("rw", outputdb.outputChunks, () =>
        outputdb.outputChunks.bulkAdd(batch),
    );
}

/** Never rejects: output that cannot be stored is dropped and logged. */
export async function flushOutputChunks() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (pendingChunks.length > 0) {
        const batch = pendingChunks;
        pendingChunks = [];
        enqueueWrite(() => writeChunks(batch)).catch((e) =>
            console.error("Could not store output", e),
        );
    }
    await writeQueue;
}

export async function getOutputChunks(testCaseId: string) {
    await flushOutputChunks();
    return outputdb.outputChunks
        .where("testCaseId")
        .equals(testCaseId)
        .toArray();
}

let clearCount = 0;

export function outputClearCount() {
    return clearCount;
}

export async function clearOutputBuffer() {
    clearCount++;
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    pendingChunks = [];
    return enqueueWrite(() => outputdb.outputChunks.clear());
}

export async function getOutputString(caseId: string) {
    return (await getOutputChunks(caseId)).map((c) => c.content).join("");
}

export type SharedOutputCase = Omit<OutputCase, "testCaseId" | "status"> & {
    testCaseId?: string;
    status?: Exclude<OutputCase["status"], "queued">;
    content: string;
};

export async function exportOutputCases(
    cases: OutputCase[],
    maxChars: number,
): Promise<SharedOutputCase[]> {
    // A case that has not run has no output, and shares have no such status.
    return Promise.all(
        cases
            .filter(
                (c): c is OutputCase & Pick<SharedOutputCase, "status"> =>
                    c.status !== "queued",
            )
            .map(async (c) => ({
                ...c,
                content: (await getOutputString(c.testCaseId)).slice(
                    0,
                    maxChars,
                ),
            })),
    );
}

export async function importOutputCases(
    cases: SharedOutputCase[],
): Promise<OutputCase[]> {
    await clearOutputBuffer();
    const meta = cases.map(({ content, ...c }, i) => {
        const testCaseId = c.testCaseId ?? `shared-${i}`;
        addOutputChunk(testCaseId, {
            type: c.type === "err" ? "error" : "stdout",
            content,
        });
        return { ...c, testCaseId };
    });
    await flushOutputChunks();
    return meta;
}

export function outputChunkToHtml(chunk: OutputChunk) {
    if (chunk.type === "stdout") return htmlEscape(chunk.content);
    else if (chunk.type === "stderr" || chunk.type === "error")
        return `<span class="text-destructive">${htmlEscape(chunk.content)}</span>`;
    else return htmlEscape(chunk.content);
}

export async function getOutputHtml(caseId: string) {
    return (await getOutputChunks(caseId)).map(outputChunkToHtml).join("");
}
