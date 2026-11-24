import * as THREE from 'three';
import { QuadMesh, NodeMaterial, RenderTarget } from 'three/webgpu';
import { texture, uv, uniform, vec3, vec4, max } from 'three/tsl';

export function createGlow(renderer) {
  const make = () => new RenderTarget(4, 4, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const a = make(), b = make(), c = make();

  const blurOf = source => {
    const step = uniform(new THREE.Vector2()), cut = uniform(0);
    const tap = k => texture(source.texture, uv().add(step.mul(k))).rgb;
    const m = new NodeMaterial();
    m.depthTest = false; m.depthWrite = false;
    m.fragmentNode = vec4(max(tap(0).mul(0.227).add(tap(1.385).add(tap(-1.385)).mul(0.316)).add(tap(3.231).add(tap(-3.231)).mul(0.070)).sub(cut), 0), 1);
    return { m, step, cut };
  };
  const fromA = blurOf(a), fromB = blurOf(b);
  const gain = uniform(1), wideGain = uniform(1), split = uniform(0);
  const add = new NodeMaterial();
  add.depthTest = false; add.depthWrite = false; add.transparent = true;

  Object.assign(add, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const t = texture(a.texture, uv()).rgb, d = uv().sub(0.5).mul(split);
  const w3 = vec3(texture(c.texture, uv().add(d)).r, texture(c.texture, uv()).g, texture(c.texture, uv().sub(d)).b);
  add.fragmentNode = vec4(t.mul(gain).add(t.mul(t).mul(gain).mul(1.6)).add(w3.mul(wideGain)), 1);
  const quad = new QuadMesh(fromA.m);
  let w = 4, h = 4;
  function setSize(cssW, cssH) { w = Math.max(64, Math.round(cssW / 4)); h = Math.max(64, Math.round(cssH / 4)); for (const x of [a, b, c]) x.setSize(w, h); }
  const pass = (material, target) => { quad.material = material; renderer.setRenderTarget(target); quad.render(renderer); };
  const blurPass = (from, to, x, y, cut) => { from.step.value.set(x, y); from.cut.value = cut; pass(from.m, to); };
  function render(sceneToGlow, cam, { gain: g = 0.8, wide = 0.5, split: s = 0.004 } = {}, pre, post) {
    const auto = renderer.autoClear;
    pre?.();
    renderer.setRenderTarget(a); renderer.clear(); renderer.render(sceneToGlow, cam);
    post?.();
    blurPass(fromA, b, 1 / w, 0, 0.03); blurPass(fromB, a, 0, 1 / h, 0);
    blurPass(fromA, b, 3.2 / w, 0, 0); blurPass(fromB, c, 0, 3.2 / h, 0);
    renderer.autoClear = false;
    gain.value = g; wideGain.value = wide; split.value = s; pass(add, null);
    renderer.autoClear = auto;
  }
  return { render, setSize };
}
