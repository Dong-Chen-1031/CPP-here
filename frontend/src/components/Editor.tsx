import React, { useState, useCallback } from "react";
import CodeMirror, { type ReactCodeMirrorProps } from "@uiw/react-codemirror";
import { cpp } from "@codemirror/lang-cpp";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  autocompletion,
  CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { cppKeywords } from "../config/cppKeywords";

type CppEditorProps = Omit<ReactCodeMirrorProps, "value" | "onChange"> & {
  defaultValue?: string;
  onChange?: (value: string) => void;
};

function cppCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\w*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: cppKeywords,
  };
}

function CppEditor({
  defaultValue = '#include <iostream>\n\nint main() {\n  std::cout << "Hello World";\n  return 0;\n}',
  onChange,
  extensions = [],
  basicSetup,
  className,
  style,
  ...rest
}: CppEditorProps) {
  const [code, setCode] = useState(defaultValue);

  const handleChange = useCallback(
    (value: string) => {
      setCode(value);
      onChange?.(value);
    },
    [onChange],
  );

  return (
    <CodeMirror
      className={className}
      style={style}
      value={code}
      height="100%"
      theme={oneDark}
      extensions={[
        cpp(),
        autocompletion({ override: [cppCompletions] }),
        ...extensions,
      ]}
      onChange={handleChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        ...(typeof basicSetup === "object" ? basicSetup : {}),
      }}
      {...rest}
    />
  );
}

export default CppEditor;
