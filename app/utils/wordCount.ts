/**
 * 章节字数统计规则，与前端 countTextWords 保持一致。
 * 去除所有空白字符（空格、换行、制表等）后返回剩余字符数。
 * @param content 章节明文。
 * @returns 字数。
 */
export function countWords(content: string): number {
  return content.replace(/\s/g, "").length;
}