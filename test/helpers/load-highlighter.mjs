import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {highlightAeon as renderAeon, highlightJson} from '@altopelago/aeon-highlight';
export function loadHighlighter(){
  const context=vm.createContext({window:{},document:{querySelectorAll:()=>[]},renderAeon,highlightJson});
  const source=readFileSync(new URL('../../tools/playground/aeon-highlight.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
  vm.runInContext(source,context);return context.window.AeonWebHighlight;
}
