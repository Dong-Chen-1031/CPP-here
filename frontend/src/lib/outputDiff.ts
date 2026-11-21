import { diffArrays, diffChars } from "diff";

export function judgedLines(text: string) {
    return text
        .trim()
        .split("\n")
        .map((line) => line.trimEnd());
}

export type DiffSegment = { text: string; changed: boolean };

type RowKind = "same" | "changed" | "missing" | "extra";

export interface LineRow {
    kind: RowKind;
    expectedNo?: number;
    actualNo?: number;
    expected?: DiffSegment[];
    actual?: DiffSegment[];
}

export interface GapRow {
    kind: "skip" | "more";
    count: number;
}

export type DiffRow = LineRow | GapRow;

export interface OutputDiff {
    differing: number;
    rows: DiffRow[];
}

interface AlignedLine {
    kind: RowKind;
    expectedNo?: number;
    actualNo?: number;
    expected?: string;
    actual?: string;
}

const CONTEXT = 1;
const MAX_ROWS = 200;
const MAX_CHAR_DIFF = 500;

function whole(text: string | undefined, changed: boolean) {
    return text === undefined ? undefined : [{ text, changed }];
}

function toLineRow(line: AlignedLine): LineRow {
    const { kind, expected, actual } = line;
    if (
        kind !== "changed" ||
        expected!.length > MAX_CHAR_DIFF ||
        actual!.length > MAX_CHAR_DIFF
    )
        return {
            ...line,
            expected: whole(expected, kind !== "same"),
            actual: whole(actual, kind !== "same"),
        };
    const parts = diffChars(expected!, actual!);
    return {
        ...line,
        expected: parts
            .filter((part) => !part.added)
            .map((part) => ({ text: part.value, changed: part.removed })),
        actual: parts
            .filter((part) => !part.removed)
            .map((part) => ({ text: part.value, changed: part.added })),
    };
}

function positionalLines(expected: string[], actual: string[]) {
    const lines: AlignedLine[] = [];
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
        const e = i < expected.length ? expected[i] : undefined;
        const a = i < actual.length ? actual[i] : undefined;
        lines.push({
            kind:
                e === undefined
                    ? "extra"
                    : a === undefined
                      ? "missing"
                      : e === a
                        ? "same"
                        : "changed",
            expectedNo: e === undefined ? undefined : i + 1,
            actualNo: a === undefined ? undefined : i + 1,
            expected: e,
            actual: a,
        });
    }
    return lines;
}

function alignedLines(expected: string[], actual: string[]) {
    const changes = diffArrays(expected, actual, { timeout: 200 });
    if (!changes) return positionalLines(expected, actual);
    const lines: AlignedLine[] = [];
    let e = 0;
    let a = 0;
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (!change.added && !change.removed) {
            for (const line of change.value)
                lines.push({
                    kind: "same",
                    expectedNo: ++e,
                    actualNo: ++a,
                    expected: line,
                    actual: line,
                });
            continue;
        }
        const removed = change.removed ? change.value : [];
        const next = changes[i + 1];
        const added = change.added
            ? change.value
            : next?.added
              ? (i++, next.value)
              : [];
        const paired = Math.min(removed.length, added.length);
        for (let j = 0; j < paired; j++)
            lines.push({
                kind: "changed",
                expectedNo: ++e,
                actualNo: ++a,
                expected: removed[j],
                actual: added[j],
            });
        for (const line of removed.slice(paired))
            lines.push({ kind: "missing", expectedNo: ++e, expected: line });
        for (const line of added.slice(paired))
            lines.push({ kind: "extra", actualNo: ++a, actual: line });
    }
    return lines;
}

export function diffOutput(output: string, expected: string): OutputDiff {
    const aligned = alignedLines(judgedLines(expected), judgedLines(output));
    const shown = aligned.map(() => false);
    aligned.forEach((line, i) => {
        if (line.kind === "same") return;
        for (let j = i - CONTEXT; j <= i + CONTEXT; j++)
            if (j >= 0 && j < aligned.length) shown[j] = true;
    });
    shown.forEach((visible, i) => {
        if (!visible && shown[i - 1] !== false && shown[i + 1] !== false)
            shown[i] = true;
    });

    const rows: DiffRow[] = [];
    let skipped = 0;
    let i = 0;
    for (; i < aligned.length && rows.length < MAX_ROWS; i++) {
        if (!shown[i]) {
            skipped++;
            continue;
        }
        if (skipped) rows.push({ kind: "skip", count: skipped });
        skipped = 0;
        rows.push(toLineRow(aligned[i]));
    }
    if (i < aligned.length)
        rows.push({ kind: "more", count: aligned.length - i + skipped });
    else if (skipped) rows.push({ kind: "skip", count: skipped });

    return {
        differing: aligned.filter((line) => line.kind !== "same").length,
        rows,
    };
}
