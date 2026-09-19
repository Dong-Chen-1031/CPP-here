import { atomWithStorage } from "jotai/utils";
import { Dexie, type EntityTable } from "dexie";
import htmlEscape from "escape-html";
interface outputChunkDB {
    id: number;
    testCaseId: string;
    type: "stdout" | "stderr";
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
    rev: number;
}

export type OutputChunk = {
    type: "stdout" | "stderr";
    content: string;
};

export const outputStore = atomWithStorage<OutputCase[]>("output", []);

export function addOutputChunk(testCaseId: string, chunk: OutputChunk) {
    outputdb.outputChunks.add({
        testCaseId,
        type: chunk.type,
        content: chunk.content,
    });
}

export async function getOutputChunks(testCaseId: string) {
    return outputdb.outputChunks
        .where("testCaseId")
        .equals(testCaseId)
        .toArray();
}

export async function clearOutputBuffer() {
    return outputdb.outputChunks.clear();
}

export async function getOutputString(caseId: string) {
    return (await getOutputChunks(caseId)).map((c) => c.content).join("");
}

export function outputChunkToHtml(chunk: OutputChunk) {
    if (chunk.type === "stdout") return htmlEscape(chunk.content);
    else if (chunk.type === "stderr")
        return `<span class="text-red-500">${htmlEscape(chunk.content)}</span>`;
    else return htmlEscape(chunk.content);
}

export async function getOutputHtml(caseId: string) {
    return (await getOutputChunks(caseId)).map(outputChunkToHtml).join("");
}
