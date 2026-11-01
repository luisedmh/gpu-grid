import Editor from '@monaco-editor/react';
import '../lib/monaco.ts';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Code editor with C++ highlighting, which also covers CUDA syntax. */
export function CodeEditor({ value, onChange }: CodeEditorProps) {
  return (
    <Editor
      language="cpp"
      theme="vs-dark"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        padding: { top: 12 },
      }}
    />
  );
}
