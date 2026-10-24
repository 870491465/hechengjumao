const assert = require('node:assert/strict');
const { Session, pairContacts } = require('../assets/scripts/Rules.ts');
const { ShakeController } = require('../assets/scripts/ShakeController.ts');
const { CONFIG, radius, clampX, MAX_DROP_LEVEL, SPAWN_Y, INPUT_TOP, TOP } = require('../assets/scripts/GameConfig.ts');
let count = 0;
function test(name, fn) { fn(); count++; console.log(`PASS ${name}`); }

test('first four drops stay 1,1,2,1; levels 1-4 follow configured probabilities', () => {
  const s = new Session(123); const levels = [];
  for (let i = 0; i < 4; i++) { levels.push(s.current); s.acceptDrop(); }
  assert.deepEqual(levels, [1, 1, 2, 1]);
  const a = new Session(42), b = new Session(42), buckets = [0, 0, 0, 0];
  for (let i = 0; i < 20000; i++) { const x = a.draw(); assert.equal(x, b.draw()); assert.ok(x>=1&&x<=4);buckets[x - 1]++; }
  assert.equal(MAX_DROP_LEVEL,4);
  assert.ok(Math.abs(CONFIG.probabilities.reduce((a,b)=>a+b,0)-1)<1e-10);
  for(let i=0;i<4;i++)assert.ok(Math.abs(buckets[i]/20000-CONFIG.probabilities[i])<.015);
  assert.ok(buckets[3]>0);assert.ok(SPAWN_Y-radius(4)>TOP);assert.equal(INPUT_TOP,SPAWN_Y+radius(4)+12);
});
const cat = (id, x = 0, level = 1) => ({ id, x, y: 0, level, locked: false, mergeAt: 0 });
test('triple contact consumes one closest pair; input order and duplicate callbacks do not matter', () => {
  const a = cat(1, 0), b = cat(2, 12), c = cat(3, 20);
  const contacts = [[a, b], [a, c], [b, c], [b, a], [c, b]];
  assert.deepEqual(pairContacts(contacts, 1).map(p => p.map(c => c.id)), [[2, 3]]);
  assert.deepEqual(pairContacts(contacts.reverse(), 1).map(p => p.map(c => c.id)), [[2, 3]]);
});
test('tie resolved by generation IDs; locked, protected and unequal cats excluded', () => {
  const a = cat(1), b = cat(2), c = cat(3);
  assert.deepEqual(pairContacts([[b, c], [a, c], [b, a]], 0).map(p => p.map(c => c.id)), [[1, 2]]);
  a.locked = true; b.mergeAt = .1;
  assert.equal(pairContacts([[a, c], [b, c], [c, cat(4, 0, 2)]], 0).length, 0);
  assert.equal(pairContacts([[b, c]], .1).length, 1);
  assert.equal(pairContacts([[cat(5, 0, 8), cat(6, 0, 8)]], 10).length, 0);
});
test('dense simultaneous contacts never reuse an entity', () => {
  const cats = Array.from({length:60}, (_, i) => cat(i + 1, i % 5));
  const pairs = [];
  for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) pairs.push([cats[i], cats[j]]);
  const result = pairContacts(pairs, 0), ids = result.flat().map(c => c.id);
  assert.equal(result.length, 30); assert.equal(new Set(ids).size, ids.length);
});
test('merge scoring uses product level and rounds chain multipliers; accepted actions reset group', () => {
  const s = new Session(1);
  assert.equal(s.merge(2), 10); s.time = 1; assert.equal(s.merge(3), 24);
  s.time = 1.5; assert.equal(s.merge(4), 56); assert.equal(s.merge(5), 128);
  assert.equal(s.merge(6), 288); assert.equal(s.merge(7), 576);
  s.acceptDrop(); assert.equal(s.merge(2), 10); s.breakChain(); assert.equal(s.merge(2), 10);
  s.time += 1.001; assert.equal(s.merge(2), 10); assert.equal(s.maxChain, 6);
});
test('danger persists across identity changes and short clear gaps; .2s clear resets', () => {
  const s = new Session(); s.updateDanger(true, 2.5);
  s.updateDanger(false, .1); assert.equal(s.danger, 2.5);
  assert.equal(s.updateDanger(true, .5), true);
  s.updateDanger(false, .1); s.updateDanger(false, .1); assert.equal(s.danger, 0);
});
test('settlement is idempotent and a committed victory cannot become failure', () => {
  const s = new Session(); assert.equal(s.settle('won'), true);
  assert.equal(s.settle('lost'), false); assert.equal(s.settle('won'), false); assert.equal(s.state, 'won');
});
test('shake refuses invalid actions, spends once, ends at .8s, cools down for 3s', () => {
  const sh = new ShakeController();
  assert.equal(sh.start(0, false), false); assert.equal(sh.remaining, 2);
  assert.equal(sh.start(0, true), true); assert.equal(sh.start(0, true), false); assert.equal(sh.remaining, 1);
  let now = 0, contribution = 0, max = 0;
  for (let i = 0; i < 48; i++) { now += CONFIG.fixedStep;
    sh.tick(CONFIG.fixedStep, now, (_, dv) => { contribution += dv; max = Math.max(max, Math.abs(contribution)); }, [1]); }
  assert.equal(sh.active, false); assert.ok(max <= CONFIG.width * .25 + 1e-8);
  assert.ok(Math.abs(sh.readyAt - 3.8) < 1e-8);
  assert.equal(sh.start(3.79, true), false); assert.equal(sh.start(3.8, true), true); assert.equal(sh.remaining, 0);
  sh.stop(); assert.equal(sh.start(10, true), false);
});
test('all levels clamp inside walls with PRD safety gap', () => {
  for (let l = 1; l <= 8; l++) {
    const r = radius(l); assert.ok(clampX(-9999, r) - r >= -300 + 6);
    assert.ok(clampX(9999, r) + r <= 300 - 6);
  }
});
console.log(`${count} rules checks passed.`);
