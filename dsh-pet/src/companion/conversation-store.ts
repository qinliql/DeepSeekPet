/** Standalone-only durable conversation store preserving the legacy JSON shape. */
import { z } from 'zod';
import { RecoverableStore } from './store.ts';
import type { ChatMemoryMessage } from '../host/chat.ts';
type Conversations = Record<string, Record<string, { messages: ChatMemoryMessage[] }>>;
const message = z.object({ role: z.enum(['user', 'assistant']), content: z.string(), ts: z.number() }).passthrough();
const schema = z.record(z.string(), z.record(z.string(), z.object({ messages: z.array(message) }).passthrough()));
export function createConversationStore(root: string) {
  const store = new RecoverableStore(root, 'memory', (v): v is Conversations => schema.safeParse(v).success);
  let cached: Conversations | undefined;
  let changed = () => {};
  return {
    onChange(listener: () => void) {
      changed = listener;
    },
    read: () => structuredClone(cached ?? (cached = store.read(() => ({})))),
    write: (value: Conversations) => {
      store.write(value);
      cached = structuredClone(value);
      changed();
    },
    validate: (value: unknown) => schema.safeParse(value).success,
    restore(value: unknown) {
      const parsed = schema.parse(value) as Conversations;
      store.write(parsed);
      cached = structuredClone(parsed);
      changed();
    },
  };
}
export type ConversationStore = ReturnType<typeof createConversationStore>;
