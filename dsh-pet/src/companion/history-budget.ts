/** Bound model context without trimming the durable conversation archive. */
import type { ChatMemoryMessage } from '../host/chat.ts';
export function fitHistory(messages: readonly ChatMemoryMessage[], budget = 14000): ChatMemoryMessage[] {
  const result: ChatMemoryMessage[] = [];
  let left = budget;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const content =
      message.content.length > 3500
        ? message.content.slice(0, 1000) + '\n[较早长消息节选]\n' + message.content.slice(-2400)
        : message.content;
    if (content.length > left) break;
    left -= content.length;
    result.unshift({ ...message, content });
  }
  while (result[0]?.role === 'assistant') result.shift();
  return result;
}
