import { musicScript } from '../app/music-page.ts';
import { studioScript } from '../app/studio-page.ts';
/** Embedded browser scripts must parse as delivered, not only as TypeScript templates. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { companionScript } from './page.ts';
import { chatScript } from '../app/chat-page.ts';
test('companion and messenger browser scripts parse without broken template escapes', () => {
  assert.doesNotThrow(() => new Script(studioScript));
  assert.doesNotThrow(() => new Script(companionScript));
  assert.doesNotThrow(() => new Script(chatScript));
});

test('music browser script parses', () => assert.doesNotThrow(() => new Script(musicScript)));
