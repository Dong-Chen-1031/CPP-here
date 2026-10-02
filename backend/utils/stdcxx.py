"""Python copy of cpp-here-build's starts_with_stdcxx, for a trace attribute.

cpp-here-build (builder/docker/cpp-here-build) makes the actual decision to use
the precompiled bits/stdc++.h, and this mirrors its rule: past comments, blank
lines and `#pragma GCC optimize/target`, the first line is
`#include <bits/stdc++.h>`. -std values without a PCH (c++98) aside.

Kept free of other imports so builder/test/regression/run.sh can check it
against cpp-here-build --uses-pch on every case without the backend's
dependencies.
"""

import re

_COMMENT = re.compile(r"//(?:[^\n]*\\\r?\n)*[^\n]*|/\*.*?(?:\*/|$)", re.S)
_SKIPPED = re.compile(r"[ \t]*#[ \t]*pragma[ \t]+GCC[ \t]+(?:optimize|target)[ \t]*\(")
_STDCXX = re.compile(r"[ \t]*#[ \t]*include[ \t]*[<\"]bits/stdc\+\+\.h[>\"][ \t\r]*")


def _strip_comment(m: re.Match) -> str:
    # As in cpp-here-build: a block comment becomes a space, a line comment
    # nothing, and the newlines inside either are kept so lines stay apart
    text = m.group()
    return (" " if text.startswith("/*") else "") + "\n" * text.count("\n")


def starts_with_stdcxx(code: str) -> bool:
    code = _COMMENT.sub(_strip_comment, code.removeprefix("\ufeff"))
    for line in code.split("\n"):
        if _SKIPPED.match(line):
            continue
        if line.strip(" \t\r"):
            return bool(_STDCXX.fullmatch(line))
    return False


if __name__ == "__main__":
    # Used by builder/test/regression/run.sh: prints "<1|0> <path>" per file
    import sys

    for path in sys.argv[1:]:
        # newline="" keeps \r\n as the backend receives it
        with open(path, encoding="utf-8", errors="surrogateescape", newline="") as f:
            print(int(starts_with_stdcxx(f.read())), path)
