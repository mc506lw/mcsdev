/**
 * 配置"二次替换"（键级补丁，DESIGN.md §5.x）：
 *
 * 原则：Paper/Spigot 首次启动会自己生成**带该版本正确键**的完整配置文件
 * （server.properties / bukkit.yml / spigot.yml / paper-global.yml …）。
 * 我们不整文件覆盖（会丢掉版本特有键），而是只 patch 我们管理的键，
 * 其余全部保留 —— 版本差异由服务器自己维护，我们只做增量。
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** server.properties 风格：替换 "key=value" 行（保留顺序与其他行），缺失则追加到末尾 */
export function patchKeyValue(text: string, key: string, value: string): string {
  const re = new RegExp(`^${escapeRegExp(key)}=(.*)$`, 'm');
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  const trimmed = text.replace(/\s*$/, '');
  return trimmed === '' ? `${key}=${value}\n` : `${trimmed}\n${key}=${value}\n`;
}

/**
 * 简单 YAML 逐行补丁（bukkit.yml / spigot.yml 风格，2 空格缩进）：
 * - 已存在 <缩进><key>: ... → 只替换值（保留缩进与注释顺序）
 * - 不存在且给了 parentBlock（如 settings）→ 插入到父块第一行之后
 * - 都没有 → 追加到末尾
 */
export function patchYamlValue(text: string, key: string, value: string, parentBlock?: string): string {
  const re = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*.*$`, 'm');
  const m = text.match(re);
  if (m) return text.replace(re, `${m[1]}${key}: ${value}`);

  if (parentBlock) {
    const pm = text.match(new RegExp(`^(\\s*)${escapeRegExp(parentBlock)}:\\s*$`, 'm'));
    if (pm) {
      const indent = `${pm[1]}  `;
      const idx = text.indexOf(pm[0]) + pm[0].length;
      return text.slice(0, idx) + `\n${indent}${key}: ${value}` + text.slice(idx);
    }
  }
  const trimmed = text.replace(/\s*$/, '');
  const block = parentBlock ? `${parentBlock}:\n` : '';
  return `${trimmed}\n${block}${parentBlock ? '  ' : ''}${key}: ${value}\n`.replace(/^\n/, '');
}