// 人物档案请求的提交规则。组件和测试共用，避免只在界面里隐式存在。
export interface PersonLoadResult<T> {
  person: T | null;
  failedId: string | null;
  accept: boolean;
}

export function settlePersonLoad<T extends { id: string }>(
  requestedId: string,
  currentId: string | null,
  outcome: { ok: true; person: T } | { ok: false },
): PersonLoadResult<T> {
  if (currentId !== requestedId) return { person: null, failedId: null, accept: false };
  if (!outcome.ok || outcome.person.id !== requestedId) {
    return { person: null, failedId: requestedId, accept: true };
  }
  return { person: outcome.person, failedId: null, accept: true };
}
