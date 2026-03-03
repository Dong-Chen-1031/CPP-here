import React, { useState, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  autocompletion,
  CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { cppKeywords } from "../config/cppKeywords";

function cppCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: cppKeywords,
  };
}

function CppEditor() {
  const [code, setCode] = useState(
    '#include <iostream>\n\nint main() {\n  std::cout << "Hello World";\n  return 0;\n}',
  );

  const onChange = useCallback((value: string, viewUpdate: any) => {
    console.log("當前代碼:", value);
    setCode(value);
  }, []);

  return (
    <div
      style={{
        border: "1px solid #444",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <CodeMirror
        value={code}
        height="400px"
        theme={oneDark}
        extensions={[cpp(), autocompletion({ override: [cppCompletions] })]} // 載入 C++ 語法高亮與自動補全
        onChange={onChange}
        basicSetup={{
          lineNumbers: true, // 顯示行號
          foldGutter: true, // 程式碼摺疊
          highlightActiveLine: true,
        }}
      />
    </div>
  );
}

export default CppEditor;
