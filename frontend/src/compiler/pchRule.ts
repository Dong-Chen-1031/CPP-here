// Same conservative rule as builder/docker/cpp-here-build. Loading a PCH
// before a #define or another include would change the program's meaning.
export function startsWithStdcxx(source: string): boolean {
    let block = false;
    let continued = false;
    for (let line of source.replace(/^\uFEFF/, "").split("\n")) {
        if (continued) {
            continued = /\\\r?$/.test(line);
            continue;
        }
        let out = "";
        while (line) {
            if (block) {
                const end = line.indexOf("*/");
                if (end < 0) {
                    line = "";
                    break;
                }
                line = line.slice(end + 2);
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
        if (
            /^[ \t]*#[ \t]*pragma[ \t]+GCC[ \t]+(optimize|target)[ \t]*\(/.test(
                out,
            )
        )
            continue;
        if (/[^ \t\r]/.test(out))
            return /^[ \t]*#[ \t]*include[ \t]*[<"]bits\/stdc\+\+\.h[>"][ \t\r]*$/.test(
                out,
            );
    }
    return false;
}
