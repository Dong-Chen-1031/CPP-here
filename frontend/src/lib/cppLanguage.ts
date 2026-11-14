import { cppLanguage } from "@codemirror/lang-cpp";
import {
    LanguageSupport,
    continuedIndent,
    delimitedIndent,
    flatIndent,
    indentNodeProp,
} from "@codemirror/language";

/**
 * C++ language support with corrected indentation rules.
 *
 * `@codemirror/lang-cpp` indents a `{` on its own line after `for (...)`,
 * `while (...)`, `do`, `switch (...)` and `try` one level too deep:
 *
 *     for (int i = 0; i < n; i++)
 *         {          <- should line up with `for`
 *
 * When `{` is typed, the line is re-indented and the indent rule sees the
 * whole line, leading whitespace included. The upstream `Statement` rule
 * tests `/^{/`, which never matches `    {`, and the `TryStatement` rule tests
 * `/^\s*({|catch)\b/`, where `\b` never matches right after `{`. Only the
 * `IfStatement` rule allows leading whitespace, which is why `if` works.
 *
 * Adding a rule for the `Statement` group would also replace the specific
 * rules of the statements in that group, so the whole upstream table is
 * restated here with the two patterns fixed.
 */
const fixedCppLanguage = cppLanguage.configure({
    props: [
        indentNodeProp.add({
            IfStatement: continuedIndent({ except: /^\s*({|else\b)/ }),
            TryStatement: continuedIndent({ except: /^\s*({|catch\b)/ }),
            LabeledStatement: flatIndent,
            CaseStatement: (context) => context.baseIndent + context.unit,
            BlockComment: () => null,
            CompoundStatement: delimitedIndent({ closing: "}" }),
            Statement: continuedIndent({ except: /^\s*{/ }),
        }),
    ],
});

/**
 * After the `}` of a `try` block, the new line is indented as if it were the
 * body of an unfinished `try`. Re-indent when `catch` is typed, so it moves
 * back to line up with `try`, the way `}` and `case` already do.
 */
const reindentOnCatch = fixedCppLanguage.data.of({
    indentOnInput: /^\s*catch$/,
});

export function cpp() {
    return new LanguageSupport(fixedCppLanguage, [reindentOnCatch]);
}
