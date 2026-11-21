import * as THREE from 'three';
import { LineBasicNodeMaterial, PointsNodeMaterial } from 'three/webgpu';
import {
  Fn, If, Discard, reference, uniformArray, attribute, instancedDynamicBufferAttribute, texture, varying, select,
  float, int, vec2, vec3, vec4, sin, cos, atan, exp, dot, cross, mix, clamp, abs, floor, fract, max, length, smoothstep,
  positionGeometry, modelViewMatrix, screenDPR, uv,
} from 'three/tsl';
import { Threads, MAX } from './threads.js';

const modFloor = (x, y) => x.sub(floor(x.div(y)).mul(y));
const qrot = (q, v) => v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2));
const hsl = (h, s, l) => {
  const rgb = clamp(abs(modFloor(vec3(h).mul(6).add(vec3(0, 4, 2)), 6).sub(3)).sub(1), 0, 1);
  return vec3(l).add(rgb.sub(0.5).mul(s).mul(float(1).sub(abs(float(l).mul(2).sub(1)))));
};

const fallOff = (edge, d) => float(1).sub(smoothstep(0, edge, d));

export class GPUThreads extends Threads {

  nodes() {
    if (this._nodes) return this._nodes;
    const U = this.uniforms, f = name => reference('value', 'float', U[name]);
    this._nodes = {
      time: f('uTime'), breath: f('uBreath'), chaos: f('uChaos'), hue: f('uHue'), mode: f('uMode'), lit: f('uLit'),
      opacity: f('uOpacity'), shift: f('uShift'), moodAmt: f('uMoodAmt'), current: f('uCurrent'), whole: f('uWhole'),
      pointScale: f('uPointScale'),
      moodA: reference('value', 'vec3', U.uMoodA), moodB: reference('value', 'vec3', U.uMoodB),
      pointer: reference('value', 'vec4', U.uPointer),
      lights: uniformArray(U.uLights.value, 'vec4'), swells: uniformArray(U.uSwells.value, 'vec4'),
      pieceQ: uniformArray(U.uPieceQ.value, 'vec4'), pieceT: uniformArray(U.uPieceT.value, 'vec3'),
      pieceC: uniformArray(U.uPieceC.value, 'vec3'), ripples: uniformArray(U.uRipples.value, 'vec3'),
      atlas: U.uAtlas.value,
    };
    return this._nodes;
  }

  deform(p0, uvA, piece) {
    const T = this.nodes(), u = uvA.x, v = uvA.y;
    let light = float(0);
    for (let i = 0; i < 3; i++) { const L = T.lights.element(i), d = p0.sub(L.xyz); light = light.add(L.w.div(dot(d, d).mul(2.4).add(1))); }
    light = light.toVar();
    const dp = p0.sub(T.pointer.xyz);
    const near = T.pointer.w.div(dot(dp, dp).mul(8).add(1)).toVar();
    let local = float(0);
    for (let i = 0; i < 3; i++) {
      const S = T.swells.element(i);
      let d = vec2(u, v).sub(S.xy);
      d = atan(sin(d), cos(d));
      local = local.add(S.z.mul(exp(dot(d, d).negate().div(S.w.mul(S.w)))));
    }
    const open = T.breath.mul(mix(0.22, 1.0, T.whole)).add(local.mul(float(1).sub(T.whole.mul(0.7)))).mul(light.add(0.45)).toVar();
    const seam = float(1).add(float(0.06).add(sin(v.mul(3).add(u.mul(2))).mul(0.09)).mul(open));
    let wave = float(0.018).mul(T.chaos).mul(sin(u.mul(7).add(v.mul(4)).add(T.time.mul(0.7))))
      .add(near.mul(0.035).mul(sin(u.mul(9).sub(T.time.mul(3)))));
    for (let i = 0; i < 4; i++) {
      const R = T.ripples.element(i), age = T.time.sub(R.x);
      wave = wave.add(select(age.greaterThan(0).and(age.lessThan(3.5)),
        float(0.11).mul(R.z).mul(sin(u.mul(5).sub(age.mul(8)).add(R.y))).mul(exp(age.mul(-1.3))), float(0)));
    }
    wave = wave.toVar();
    const q = vec3(
      p0.x.mul(seam).add(cos(v.add(u.mul(3))).mul(wave)),
      p0.y.mul(open.mul(0.07).add(1)).add(sin(v.sub(u.mul(4))).mul(wave)),
      p0.z.mul(open.mul(0.22).add(1)).add(cos(u.mul(3).add(v)).mul(wave).mul(2)));
    const k = int(piece.add(0.5));
    const C = T.pieceC.element(k);
    const pos = qrot(T.pieceQ.element(k), q.sub(C)).add(C).add(T.pieceT.element(k)).toVar();
    return { pos, light, near, u, v };
  }

  lineMaterial(seam) {
    const T = this.nodes();
    const material = new LineBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const uvA = attribute('aUV', 'vec2'), tone = attribute('aTone', 'vec2');
    const { pos, light, near, u, v } = this.deform(positionGeometry, uvA, attribute('aPiece', 'float'));
    material.positionNode = pos;

    const color = Fn(() => {
      const mv = modelViewMatrix.mul(vec4(pos, 1)), centre = modelViewMatrix.mul(vec4(0, 0, 0, 1));
      const front = clamp(mv.z.sub(centre.z).div(1.3), -1, 1);
      const current = sin(u.mul(14).sub(T.time.mul(T.current).mul(near.mul(5).add(1))).add(v.mul(2))).mul(0.5).add(0.5);
      const hue = T.hue.add(tone.x).add(near.mul(0.12)).add(T.shift);
      const lum = clamp(float(0.56).add(front.mul(0.18)).add(light.mul(0.1)).add(near.mul(0.18)).add(T.lit.mul(0.1)), 0.3, 0.92);
      const a = clamp(float(0.3).add(front.mul(0.12)).add(tone.y.mul(0.12)), 0.12, 0.7)
        .mul(float(0.55).add(current.mul(0.45).mul(light.add(0.5)))).mul(T.lit.mul(0.5).add(1));
      const shadowTone = hsl(hue, select(tone.y.greaterThan(0.5), float(0.65), float(0.52)), lum);

      const crystalTone = hsl(fract(hue.add(u.mul(0.16)).add(front.mul(0.14)).add(current.mul(0.06))), 0.95, near.mul(0.15).add(0.6));
      let c = mix(shadowTone, crystalTone, T.mode);

      c = mix(c, mix(T.moodB, T.moodA, tone.y).mul(lum.mul(0.6).add(0.6)), T.moodAmt.mul(float(1).sub(T.mode.mul(0.5))));
      return vec4(c, a.mul(mix(0.55, 0.6, T.mode)).mul(T.opacity));
    })();
    const vColor = varying(color, 'vThreadColor');
    material.colorNode = vColor.xyz;
    material.opacityNode = seam ? vColor.w.mul(reference('value', 'float', seam)) : vColor.w;
    return material;
  }

  makeKnots(knotGlyph) {
    const T = this.nodes(), n = MAX.KNOTS;
    const attr = (array, size) => { const a = new THREE.InstancedBufferAttribute(array, size); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.knotAttrs = { pos: attr(this.knotPos, 3), uv: attr(this.knotUV, 2), piece: attr(this.knotPiece, 1), glyph: attr(knotGlyph, 1) };
    const iPos = instancedDynamicBufferAttribute(this.knotAttrs.pos, 'vec3');
    const iUV = instancedDynamicBufferAttribute(this.knotAttrs.uv, 'vec2');
    const iPiece = instancedDynamicBufferAttribute(this.knotAttrs.piece, 'float');
    const iGlyph = instancedDynamicBufferAttribute(this.knotAttrs.glyph, 'float');
    const material = new PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
    material.alphaToCoverage = false;
    const { pos, light, near } = this.deform(iPos, iUV, iPiece);
    material.positionNode = pos;

    const mvz = modelViewMatrix.mul(vec4(pos, 1)).z;
    material.sizeNode = T.pointScale.mul(float(0.075).add(near.mul(0.08)).add(light.mul(0.02)).add(T.lit.mul(0.02))).div(mvz.negate()).div(screenDPR);
    const shadowTone = hsl(T.hue.add(T.shift).add(0.04).add(near.mul(0.12)), 0.45, 0.86);
    const crystalTone = hsl(fract(T.hue.add(T.shift).add(iGlyph.mul(0.25)).add(T.time.mul(0.02))), 0.9, 0.8);
    const vColor = varying(vec4(mix(mix(shadowTone, crystalTone, T.mode), T.moodA, T.moodAmt.mul(0.5)),
      clamp(float(0.5).add(light.mul(0.35)).add(near.mul(0.6)).add(T.lit.mul(0.3)), 0, 1).mul(T.opacity)), 'vKnotColor');
    const vGlyph = varying(iGlyph, 'vKnotGlyph'), vNear = varying(near, 'vKnotNear');

    const shade = Fn(() => {
      const pc = uv(), d = length(pc.sub(0.5)).mul(2);
      const glow = exp(d.mul(d).mul(-7)).mul(0.42).add(fallOff(0.14, d).mul(0.85));
      const glyph = texture(T.atlas, vec2(floor(vGlyph.add(0.5)).add(pc.x).div(4), pc.y)).a.mul(smoothstep(0.08, 0.5, vNear));
      const a = max(glow.mul(float(1).sub(glyph.mul(0.6))), glyph);
      If(a.lessThan(0.01), () => { Discard(); });
      return a;
    })();
    material.colorNode = vColor.xyz;
    material.opacityNode = vColor.w.mul(shade);
    const sprite = new THREE.Sprite(material);
    sprite.count = n;
    return sprite;
  }

  knotsMoved() {
    for (const a of Object.values(this.knotAttrs)) a.needsUpdate = true;
  }
}
