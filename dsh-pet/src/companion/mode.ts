/** Companion dialogue policy; pure and independent of host services. */
export type ChatMode = 'casual' | 'professional';
const TECH = /redis|sql|java|python|typescript|缓存|算法|架构|报错|异常|源码|接口|并发|设计模式|缓存穿透/i;
/** Explicit requests override automatic classification; long personal messages stay casual. */
export function detectMode(text: string): ChatMode {
  if (/简短回答|随便聊|陪我聊/.test(text)) return 'casual';
  return TECH.test(text) || text.includes('```') || /详细解释|认真分析|帮我写|如何实现|制定方案/.test(text)
    ? 'professional'
    : 'casual';
}
/** Keep the roleplay voice while allowing substantial answers for work questions. */
export function dialoguePrompt(base: string, text: string): string {
  const mode = detectMode(text);
  return (
    base +
    '\n' +
    (mode === 'casual'
      ? '【闲聊】口语短句，通常一句，尽量不超过40字。不分点，不用客服腔。'
      : '【认真模式】主人正在问正事。解除闲聊长度限制，结论先行，深入解释，可用标题、分点和代码。根据问题提供充分细节，最后自然地以傲娇的小鲸鱼语气收尾。')
  );
}
