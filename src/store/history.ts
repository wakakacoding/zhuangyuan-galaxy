// 离散步骤写入浏览器历史；高频变化只替换当前地址。
export type HistoryKind =
  | 'person-open'
  | 'person-drill'
  | 'person-close'
  | 'region-open'
  | 'region-close'
  | 'replace';

export function historyMode(kind: HistoryKind): 'push' | 'replace' {
  return kind === 'person-open' || kind === 'person-drill' || kind === 'region-open' ? 'push' : 'replace';
}

let applying = false;
export const isApplyingHistory = () => applying;

export function writeHistory(
  mutate: (params: URLSearchParams) => void,
  kind: HistoryKind,
  state: unknown = null,
) {
  if (typeof window === 'undefined' || applying) return;
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const search = params.toString();
  const url = `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (url === current && historyMode(kind) === 'replace') {
    window.history.replaceState(state ?? window.history.state, '', url);
    return;
  }
  if (url === current) return;
  if (historyMode(kind) === 'push') window.history.pushState(state, '', url);
  else window.history.replaceState(state ?? window.history.state, '', url);
}

export function bindPopState(apply: (params: URLSearchParams, state: unknown) => void) {
  const onPop = (event: PopStateEvent) => {
    applying = true;
    try {
      apply(new URLSearchParams(window.location.search), event.state);
    } finally {
      applying = false;
    }
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}
