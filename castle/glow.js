import * as THREE from 'three';

const VERT =  `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BLUR =  `
uniform sampler2D uMap; uniform vec2 uStep; uniform float uCut; varying vec2 vUv;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb * 0.227;
  c += (texture2D(uMap, vUv + uStep * 1.385).rgb + texture2D(uMap, vUv - uStep * 1.385).rgb) * 0.316;
  c += (texture2D(uMap, vUv + uStep * 3.231).rgb + texture2D(uMap, vUv - uStep * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(max(c - uCut, 0.0), 1.0);
}`;
const ADD =  `
uniform sampler2D uMap, uWide; uniform float uGain, uWideGain, uSplit; varying vec2 vUv;
void main() {
  vec3 t = texture2D(uMap, vUv).rgb;
  vec2 d = (vUv - 0.5) * uSplit;
  vec3 w = vec3(texture2D(uWide, vUv + d).r, texture2D(uWide, vUv).g, texture2D(uWide, vUv - d).b);
  gl_FragColor = vec4(t * uGain + t * t * uGain * 1.6 + w * uWideGain, 1.0);   // t*t: the brightest parts go white-hot
}`;

export function createGlow(renderer) {
  const make = () => new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const a = make(), b = make(), c = make();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blur = new THREE.ShaderMaterial({ uniforms: { uMap: { value: null }, uStep: { value: new THREE.Vector2() }, uCut: { value: 0 } }, vertexShader: VERT, fragmentShader: BLUR, depthTest: false, depthWrite: false });

  const add = new THREE.ShaderMaterial({ uniforms: { uMap: { value: a.texture }, uWide: { value: c.texture }, uGain: { value: 1 }, uWideGain: { value: 1 }, uSplit: { value: 0 } }, vertexShader: VERT, fragmentShader: ADD, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  let w = 4, h = 4;
  function setSize(cssW, cssH) { w = Math.max(64, Math.round(cssW / 4)); h = Math.max(64, Math.round(cssH / 4)); for (const t of [a, b, c]) t.setSize(w, h); }
  const pass = (material, target) => { quad.material = material; renderer.setRenderTarget(target); renderer.render(scene, camera); };
  const blurPass = (from, to, x, y, cut) => { blur.uniforms.uMap.value = from.texture; blur.uniforms.uStep.value.set(x, y); blur.uniforms.uCut.value = cut; pass(blur, to); };

  function render(sceneToGlow, cam, { gain = 0.8, wide = 0.5, split = 0.004 } = {}, pre, post) {
    const auto = renderer.autoClear;
    pre?.();
    renderer.setRenderTarget(a); renderer.clear(); renderer.render(sceneToGlow, cam);
    post?.();
    blurPass(a, b, 1 / w, 0, 0.03); blurPass(b, a, 0, 1 / h, 0);
    blurPass(a, b, 3.2 / w, 0, 0); blurPass(b, c, 0, 3.2 / h, 0);
    renderer.autoClear = false;
    add.uniforms.uGain.value = gain; add.uniforms.uWideGain.value = wide; add.uniforms.uSplit.value = split; pass(add, null);
    renderer.autoClear = auto;
  }
  return { render, setSize };
}
