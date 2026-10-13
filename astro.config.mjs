import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// GitHub Pages 部署在子路径 /zhuangyuan-galaxy/；本地 dev/preview 保持根路径
const onCI = process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  integrations: [react(), tailwind()],
  output: 'static',
  site: 'https://wakakacoding.github.io',
  base: onCI ? '/zhuangyuan-galaxy' : '/',
});
