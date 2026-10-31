/**
 * 抛体单步的边界撞击上报：钉住「撞哪条边」与「撞前速度」。
 *
 * 这两个值只服务触觉反馈与强度换算，不影响反弹本身——所以用最基础的场景固定：
 * 单边撞、角落撞取更重的一边、关掉顶部反弹就不上报。
 *
 * 跑法：node --experimental-strip-types --test src/shared/physics/throw.test.ts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { throwBounds, throwStep } from './throw.ts';
import { DEFAULT_PHYSICS } from './constants.ts';

/** 800×600 视口、100px 宽的宠物：maxX = 700，maxY = 600 - 56.25。 */
const BOUNDS = throwBounds({ W: 800, H: 600, size: 100, sideAllow: 0 });

describe('throwStep —— hit 上报', () => {
  test('没撞边：hit 为 null', () => {
    const res = throwStep({ x: 300, y: 300, vx: 0, vy: 0 }, 1 / 60, BOUNDS, DEFAULT_PHYSICS);
    assert.equal(res.hit, null);
  });

  test('撞左墙：edge=left，speed = 撞击前的水平速度', () => {
    const res = throwStep({ x: 1, y: 100, vx: -500, vy: 0 }, 0.01, BOUNDS, DEFAULT_PHYSICS);
    assert.deepEqual(res.hit, { edge: 'left', speed: 500 });
  });

  test('撞右墙：edge=right', () => {
    const res = throwStep({ x: 699, y: 100, vx: 500, vy: 0 }, 0.01, BOUNDS, DEFAULT_PHYSICS);
    assert.deepEqual(res.hit, { edge: 'right', speed: 500 });
  });

  test('落地：edge=floor，speed 是撞地前的竖直速度（含本步重力）', () => {
    const res = throwStep({ x: 100, y: 540, vx: 0, vy: 600 }, 0.02, BOUNDS, DEFAULT_PHYSICS);
    assert.equal(res.hit?.edge, 'floor');
    assert.ok((res.hit?.speed ?? 0) > 600, `应含重力增量，实际 ${res.hit?.speed}`);
  });

  test('撞顶：ceilingBounce 开启时上报 ceiling（速度已含本步重力）', () => {
    const res = throwStep({ x: 100, y: 1, vx: 0, vy: -500 }, 0.01, BOUNDS, DEFAULT_PHYSICS);
    // 先积分重力再判边界：-500 + 1400×0.01 = -486
    assert.deepEqual(res.hit, { edge: 'ceiling', speed: 486 });
  });

  test('撞顶：ceilingBounce 关闭时无边界，不上报', () => {
    const physics = { ...DEFAULT_PHYSICS, ceilingBounce: false };
    const res = throwStep({ x: 100, y: 1, vx: 0, vy: -500 }, 0.01, BOUNDS, physics);
    assert.equal(res.hit, null);
  });

  test('角落同时撞两条边：取速度更大的那条', () => {
    const res = throwStep({ x: 1, y: 540, vx: -5000, vy: 600 }, 0.01, BOUNDS, DEFAULT_PHYSICS);
    assert.equal(res.hit?.edge, 'left');
    assert.equal(res.hit?.speed, 5000);
  });
});
