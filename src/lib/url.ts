// base 感知路径工具：GitHub Pages 子路径部署（/zhuangyuan-galaxy）与本地根路径开发通用
// BASE 在 CI（GITHUB_ACTIONS 环境）构建时为 '/zhuangyuan-galaxy'，本地为 ''
export const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
export const u = (p: string): string => `${BASE}${p}`;
