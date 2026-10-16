import { atom, computed } from 'nanostores';
import { writeHistory } from './history';

// 人物帖浮层的选中栈：支持帖内关系卡互跳（栈式）与逐级返回
// URL 参数 ?p=z0001 始终指向栈顶。selectPerson（星图/地图等外部入口）重置栈为新人物。
export const personStack = atom<string[]>([]);
export const selectedPersonId = computed(personStack, (s) => (s.length ? s[s.length - 1] : null));

function writePerson(kind: 'person-open' | 'person-drill' | 'person-close', stack: string[]) {
  writeHistory((params) => {
    const top = stack[stack.length - 1];
    if (top) params.set('p', top); else params.delete('p');
  }, kind, { personStack: stack });
}

export function selectPerson(id: string | null) {
  const next = id ? [id] : [];
  const had = personStack.get().length > 0;
  personStack.set(next);
  writePerson(id && !had ? 'person-open' : id ? 'person-drill' : 'person-close', next);
}

export function pushPerson(id: string) {
  const cur = personStack.get();
  if (cur[cur.length - 1] === id) return;
  const next = [...cur, id];
  personStack.set(next);
  writePerson('person-drill', next);
}

export function popPerson() {
  const cur = personStack.get();
  if (cur.length <= 1) { selectPerson(null); return; }
  const next = cur.slice(0, -1);
  personStack.set(next);
  writePerson('person-close', next);
}

export function restorePersonStack(ids: string[]) {
  personStack.set(ids);
}

export function initSelectionFromUrl() {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search).get('p');
  if (p) personStack.set([p]);
}
