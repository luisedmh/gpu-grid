import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/cpp/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

/**
 * Monaco (the editor of VS Code) is bundled with the app instead of being
 * downloaded from a CDN at runtime, so the editor works offline and loads faster.
 * Only the core editor and C++ highlighting (which covers CUDA) are included,
 * instead of the dozens of languages Monaco ships with.
 * Its heavy work runs in a Web Worker (a background thread of the browser).
 */
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
