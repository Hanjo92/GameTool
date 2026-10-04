import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRecipe, recipeSchema } from '../packages/core/model.js';
import { defaultParticles, particlesAt, duration, type Recipe } from '../runtimes/shared/motion.js';
import { particleFields, particleStyles, defaultParticleOptions } from '../runtimes/shared/particle-options.js';
const recipe = (changes: Partial<NonNullable<Recipe['particles']>> = {}): Recipe => ({
  ...defaultRecipe, enter: 0, hold: 10, exit: 0, loop: false,
  particles: { ...defaultParticles, ...defaultParticleOptions, enabled: true, advanced: true,
    emission: 'burst', count: 1, lifetime: 2, speed: 100, spread: 0, direction: 0,
    gravity: 0, size: 10, sizeEnd: 2, speedVariation: 0, sizeVariation: 0, lifeVariation: 0,
    fadeIn: 0, fadeOut: 0, sync: false, color: '#000000', colorEnd: '#ffffff', ...changes },
});

test('advanced particles interpolate size and RGB over life with analytic drag, wind and trail endpoints', () => {
  const r = recipe({ trail: .25 }), p = particlesAt(r,1)[0];
  assert.equal(p.x, r.width / 2 + 100);
  assert.equal(p.y, r.height / 2);
  assert.equal(p.tailX, r.width / 2 + 75);
  assert.equal(p.size,15);
  assert.equal(p.red,128); assert.equal(p.green,128); assert.equal(p.blue,128);
  const d = particlesAt(recipe({drag:1,wind:20}),1)[0];
  assert.ok(Math.abs(d.x - (r.width / 2 + 100 * (1 - Math.exp(-1)) + 20)) < 1e-8);
  assert.equal(particlesAt(r,2)[0].opacity,0);
});
test('area emitters fill their bounds and orbit/vortex have distinct radial behavior', () => {
  const r = recipe({emitter:'box',areaWidth:.5,areaHeight:.2,count:100,speed:0});
  const points = particlesAt(r,0);
  assert.ok(points.every(p=> Math.abs(p.x-r.width/2) <= r.width*.25 && Math.abs(p.y-r.height/2) <= r.height*.1));
  assert.ok(new Set(points.map(p=>Math.round(p.x))).size>50);
  for (const path of ['orbit','vortex']) {
    const o = recipe({path,emitter:'ring',radius:.3,orbitSpeed:180,speed:0});
    const dist = (t:number) => {const p=particlesAt(o,t)[0];return Math.hypot(p.x-o.width/2,p.y-o.height/2);};
    assert.ok(Math.abs(dist(0)-Math.min(o.width,o.height)*.3)<1e-8);
    assert.ok(Math.abs(dist(1)-dist(0)*(path==='orbit'?1:.25))<1e-8);
  }
});
test('delay, repeat burst, cold start and timeline sync have explicit boundaries', () => {
  const r = recipe({delay:.5,burstInterval:3});
  assert.deepEqual(particlesAt(r,.49),[]);
  assert.equal(particlesAt(r,.5)[0].opacity,1);
  assert.equal(particlesAt(r,2.5)[0].opacity,0);
  assert.equal(particlesAt(r,3.5)[0].opacity,1);
  assert.deepEqual(particlesAt(r,.75),particlesAt(r,3.75));
  assert.ok(particlesAt(recipe({emission:'continuous',prewarm:false,count:50}),0).every(p=>p.opacity===0));
  assert.ok(particlesAt(recipe({emission:'continuous',prewarm:true,count:50}),0).some(p=>p.opacity>0));
  assert.equal(particlesAt({...recipe({sync:true}),enter:1},0)[0].opacity,0);
  assert.equal(particlesAt({...recipe({sync:false}),enter:1},0)[0].opacity,1);
});
test('all ten styles are schema-valid, deterministic under reverse seek and different seeds', () => {
  for (const style of particleStyles) {
    const r = recipeSchema.parse(recipe({...style.settings,count:40}));
    const expected = particlesAt(r,.7);
    particlesAt(r,4.1);
    assert.deepEqual(particlesAt(r,.7),expected,style.id);
    assert.ok(expected.some(p=>p.opacity>0),style.id);
    assert.ok(expected.every(p=>Object.values(p).every(Number.isFinite)),style.id);
    assert.notDeepEqual(particlesAt({...r,particles:{...r.particles,seed:43}},.7),expected,style.id);
    const loop = {...r,loop:true};
    const a=particlesAt(loop,.75), b=particlesAt(loop,duration(loop)+.75);
    a.forEach((p,i)=>Object.entries(p).forEach(([key,value])=>assert.ok(Math.abs(value-b[i][key as keyof typeof p]!)<1e-8)));
  }
});
test('advanced configuration validates enums and bounds while old particles keep exactly their original samples', () => {
  for (const field of particleFields) {
    if (field.max !== undefined) assert.equal(recipeSchema.safeParse(recipe({[field.key]:field.max+1})).success,false,field.key);
    if (field.type==='select') assert.equal(recipeSchema.safeParse(recipe({[field.key]:'unsupported'})).success,false,field.key);
  }
  assert.equal(recipeSchema.safeParse(recipe({colorEnd:'#fff'})).success,false);
  const old = {...defaultParticles};
  for (const f of particleFields) delete (old as any)[f.key];
  old.enabled=true;
  const raw={...defaultRecipe,particles:old};
  assert.deepEqual(particlesAt(raw,.6),particlesAt(recipeSchema.parse(raw),.6));
  assert.ok(particlesAt(raw,.6).every(p=>!Object.hasOwn(p,'tailX')));
});
