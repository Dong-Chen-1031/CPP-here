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

export const outputdb = new Dexie("OutputDatabase") as Dexie & {
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
    status?: "running" | "ac" | "error" | "wa" | "finished";
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

export async function flushOutputChunks() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (pendingChunks.length === 0) return;
    const batch = pendingChunks;
    pendingChunks = [];
    await outputdb.outputChunks.bulkAdd(batch);
}

export async function getOutputChunks(testCaseId: string) {
    await flushOutputChunks();
    return outputdb.outputChunks
        .where("testCaseId")
        .equals(testCaseId)
        .toArray();
}

export async function clearOutputBuffer() {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    pendingChunks = [];
    return outputdb.outputChunks.clear();
}

export async function getOutputString(caseId: string) {
    return (await getOutputChunks(caseId)).map((c) => c.content).join("");
}

export type SharedOutputCase = Omit<OutputCase, "testCaseId"> & {
    testCaseId?: string;
    content: string;
};

export async function exportOutputCases(
    cases: OutputCase[],
    maxChars: number,
): Promise<SharedOutputCase[]> {
    return Promise.all(
        cases.map(async (c) => ({
            ...c,
            content: (await getOutputString(c.testCaseId)).slice(0, maxChars),
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
        return `<span class="text-red-500">${htmlEscape(chunk.content)}</span>`;
    else return htmlEscape(chunk.content);
}

export async function getOutputHtml(caseId: string) {
    return (await getOutputChunks(caseId)).map(outputChunkToHtml).join("");
}
