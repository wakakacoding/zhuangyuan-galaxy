// 把 @fontsource/noto-serif-sc 的字体声明拆成两份：
//   latin ：不含 CJK 统一汉字的分片，留在首屏阻塞 CSS（西文、数字、标点，体积小）
//   cjk   ：含 U+4E00–U+9FFF 的分片，改由页面加载后异步注入，不进首屏阻塞 CSS
// 两份都保留 font-display: swap，避免中文下载完成前出现不可见文字。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'styles', 'fonts');
mkdirSync(outDir, { recursive: true });

const isCJK = (block) => {
  const m = block.match(/unicode-range:\s*([^;]+);/);
  if (!m) return false;
  return (m[1].match(/U\+([0-9a-f]+)/gi) ?? []).some((token) => {
    const n = parseInt(token.slice(2), 16);
    return n >= 0x4e00 && n <= 0x9fff;
  });
};

for (const weight of [400, 700]) {
  const css = readFileSync(join(root, 'node_modules/@fontsource/noto-serif-sc', `${weight}.css`), 'utf8');
  const blocks = css.split(/\n(?=\/\*|@font-face)/).filter((b) => b.includes('@font-face'));
  const latin = [];
  const cjk = [];
  for (const b of blocks) (isCJK(b) ? cjk : latin).push(b.trim());
  writeFileSync(join(outDir, `latin-${weight}.css`), latin.join('\n\n') + '\n');
  writeFileSync(join(outDir, `cjk-${weight}.css`), cjk.join('\n\n') + '\n');
  console.log(`weight ${weight}: latin ${latin.length} 条 / cjk ${cjk.length} 条`);
}
