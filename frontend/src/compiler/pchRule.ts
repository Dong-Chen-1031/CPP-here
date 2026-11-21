// The source's lines with comments removed, as far as the caller reads them:
// both rules below stop at the first line of code, so a long source is not
// split whole on every keystroke. A line spliced into a // comment by a
// trailing backslash is skipped.
function* linesWithoutComments(source: string) {
    let block = false;
    let continued = false;
    let start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    while (start <= source.length) {
        let end = source.indexOf("\n", start);
        if (end < 0) end = source.length;
        let line = source.slice(start, end);
        start = end + 1;
        if (continued) {
            continued = /\\\r?$/.test(line);
            continue;
        }
        let out = "";
        while (line) {
            if (block) {
                const close = line.indexOf("*/");
                if (close < 0) {
                    line = "";
                    break;
                }
                line = line.slice(close + 2);
                block = false;
                continue;
            }
            const b = line.indexOf("/*"),
                l = line.indexOf("//");
            if (l >= 0 && (b < 0 || l < b)) {
                out += line.slice(0, l);
                continued = /\\\r?$/.test(line);
                break;
            }
            if (b >= 0) {
                out += line.slice(0, b) + " ";
                line = line.slice(b + 2);
                block = true;
            } else {
                out += line;
                break;
            }
        }
        yield out;
    }
}

// clang ignores these, and competitive programmers put them first.
const IGNORED_PRAGMA =
    /^[ \t]*#[ \t]*pragma[ \t]+GCC[ \t]+(optimize|target)[ \t]*\(/;
const BLANK = /^[ \t\r]*$/;

// Same conservative rule as builder/docker/cpp-here-build. Loading a PCH
// before a #define or another include would change the program's meaning.
export function startsWithStdcxx(source: string): boolean {
    for (const line of linesWithoutComments(source)) {
        if (IGNORED_PRAGMA.test(line)) continue;
        if (!BLANK.test(line))
            return /^[ \t]*#[ \t]*include[ \t]*[<"]bits\/stdc\+\+\.h[>"][ \t\r]*$/.test(
                line,
            );
    }
    return false;
}

const INCLUDE = /^[ \t]*#[ \t]*include[ \t]*<([\w+.\/-]+)>[ \t\r]*$/;
// More than a program includes, and a bound on what one PCH is made from.
const MAX_INCLUDES = 64;

/**
 * The headers the source includes before anything else: its `#include <...>`
 * lines up to the first line that is not one (comments, blank lines and the
 * pragmas above aside). A PCH of exactly these, loaded before line 1, means
 * the same as the source, by the rule above: nothing comes before them, and
 * including a standard header again does nothing. Empty when the source
 * starts with something else, such as a #define, which could change what a
 * header declares.
 */
export function leadingIncludes(source: string): string[] {
    const headers: string[] = [];
    for (const line of linesWithoutComments(source)) {
        if (IGNORED_PRAGMA.test(line) || BLANK.test(line)) continue;
        const header = INCLUDE.exec(line)?.[1];
        if (!header) break;
        if (headers.length === MAX_INCLUDES) return [];
        headers.push(header);
    }
    return headers;
}
