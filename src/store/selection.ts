import { atom, computed } from 'nanostores';

// 人物帖浮层的选中栈：支持帖内关系卡互跳（栈式）与逐级返回
// URL 参数 ?p=z0001 始终指向栈顶。selectPerson（星图/地图等外部入口）重置栈为新人物。
export const personStack = atom<string[]>([]);
export const selectedPersonId = computed(personStack, (s) => (s.length ? s[s.length - 1] : null));

function syncUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const top = selectedPersonId.get();
  if (top) params.set('p', top); else params.delete('p');
  const url = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  window.history.replaceState(null, '', url);
}

// 外部入口（星图/地图/网络点击）：打开新帖，栈重置
export function selectPerson(id: string | null) {
  personStack.set(id ? [id] : []);
  syncUrl();
}

// 帖内关系卡跳转：压栈
export function pushPerson(id: string) {
  const cur = personStack.get();
  if (cur[cur.length - 1] === id) return;
  personStack.set([...cur, id]);
  syncUrl();
}

// 返回上一帖：弹栈
export function popPerson() {
  const cur = personStack.get();
  if (cur.length <= 1) { selectPerson(null); return; }
  personStack.set(cur.slice(0, -1));
  syncUrl();
}

export function initSelectionFromUrl() {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams(window.location.search).get('p');
  if (p) personStack.set([p]);
}
