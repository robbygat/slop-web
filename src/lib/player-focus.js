const CONTROL_KEYS = new Set(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);

export function gameControlKey(event) {
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing)return null;
  if(event.target?.closest?.('input,textarea,select,button,a,[contenteditable="true"]'))return null;
  const key=event.code==='Space'?'Space':event.key;
  return CONTROL_KEYS.has(key)?key:null;
}
