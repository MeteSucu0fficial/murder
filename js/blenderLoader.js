// Blender GLB yükleyici + İSİM TABANLI TANIMA SİSTEMİ.
// Nesne adları config.js içindeki NAME_RULES ile sınıflandırılır; başka hiçbir yerde isim kontrolü yapılmaz.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { NAME_RULES, OBJECT_OVERRIDES } from './config.js';
import { lookupName } from './util.js';
import { buildFallbackHouse } from './fallbackHouse.js';

/** house.glb'yi yükler; dosya yoksa/bozuksa örnek evi kurar. */
export async function loadHouse(url, onProgress) {
  try {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().load(
        url,
        resolve,
        (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
        reject,
      );
    });
    return { root: gltf.scene, animations: gltf.animations || [], source: 'glb' };
  } catch (error) {
    console.warn(`[blenderLoader] ${url} yüklenemedi, örnek ev kullanılıyor.`, error?.message || error);
    return { root: buildFallbackHouse(), animations: [], source: 'fallback', error };
  }
}

/**
 * Sahnedeki nesneleri isimlerine göre sınıflandırır.
 * Dönüş:
 *  model.kinds[kind] = [Entry]  →  Entry: { kind, name, node, data, box?, position, yaw }
 *  model.byName: Map<name, Object3D>
 *  model.unmatched: [{ name, type, children }]  →  hiçbir kurala uymayan adlı düğümler (debug haritası raporu için)
 * Bir kural eşleşince o düğümün alt düğümleri ayrıca sınıflandırılmaz (nesnenin parçası sayılır).
 */
export function classify(root) {
  root.updateMatrixWorld(true);
  const kinds = {};
  const byName = new Map();
  const entries = [];
  const unmatched = [];

  root.traverse((n) => {
    if (n.name && !byName.has(n.name)) byName.set(n.name, n);
  });

  const visit = (node) => {
    const name = node.name || '';
    const rule = name ? NAME_RULES.find((r) => r.test.test(name)) : null;
    if (rule) {
      const entry = makeEntry(rule, node);
      entries.push(entry);
      (kinds[rule.kind] ||= []).push(entry);
      return;
    }
    if (name) unmatched.push({ name, type: nodeType(node), children: node.children.length });
    for (const c of node.children) visit(c);
  };
  for (const c of root.children) visit(c);

  // Aynı türdekileri isme göre sırala (Door_01, Door_02 ...)
  for (const list of Object.values(kinds)) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  // Yardımcı nesneleri gizle (konum/boyut bilgisi zaten alındı)
  for (const e of entries) if (e.hide) e.node.visible = false;

  return { root, kinds, byName, entries, unmatched };
}

function nodeType(node) {
  if (node.isMesh) return 'mesh';
  if (node.isLight) return 'ışık';
  if (node.isCamera) return 'kamera';
  return node.children.length ? 'grup' : 'boş (empty)';
}

function makeEntry(rule, node) {
  const position = new THREE.Vector3();
  node.getWorldPosition(position);
  const quat = new THREE.Quaternion();
  node.getWorldQuaternion(quat);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
  const entry = {
    kind: rule.kind,
    name: node.name,
    node,
    hide: !!rule.hide,
    // Öncelik: OBJECT_OVERRIDES > Blender özel özellikleri (userData) > varsayılan
    data: { ...(node.userData || {}), ...(lookupName(OBJECT_OVERRIDES, node.name) || {}) },
    position,
    yaw: Math.atan2(fwd.x, fwd.z),
    box: null,
  };
  if (rule.kind === 'room' || rule.kind === 'deathZone') {
    entry.box = new THREE.Box3().setFromObject(node);
  }
  return entry;
}

/** Düğümün altındaki tüm mesh'ler. */
export function meshesOf(node) {
  const out = [];
  node.traverse((c) => {
    if (c.isMesh) out.push(c);
  });
  return out;
}

/**
 * Düğümün (ve alt mesh'lerinin) GÖVDE ÇERÇEVESİNDEKİ sınır kutusu: pivot = düğümün orijini, eksenler = düğümün DÜNYA yönelimi, ölçek uygulanmış.
 * (Merdiven kutusu ve serbest dönen tablo plakası bununla bulunur: dünya uzayında dönmüş nesne için de doğru kutu verir.)
 * Dönüş: { min: Vector3, max: Vector3 } (pivota göre, metre) — altında mesh yoksa null.
 */
export function bodyBounds(node) {
  node.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const part = new THREE.Box3();
  const box = new THREE.Box3();
  node.traverse((c) => {
    if (!c.isMesh || !c.geometry) return;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    m.multiplyMatrices(inv, c.matrixWorld);
    part.copy(c.geometry.boundingBox).applyMatrix4(m);
    box.union(part);
  });
  if (box.isEmpty()) return null;
  const s = node.getWorldScale(new THREE.Vector3());
  const a = box.min.clone().multiply(s);
  const b = box.max.clone().multiply(s);
  return { min: a.clone().min(b), max: a.clone().max(b) };
}

/** GLB animasyonları için küçük denetleyici (AnimationMixer). "Auto_" / "Loop_" ile başlayan klipler otomatik döner. */
export function createAnimationController(root, clips) {
  if (!clips || !clips.length) return { mixer: null, update() {}, play() {}, stop() {}, has: () => false, names: () => [] };
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));
  for (const [name, action] of actions) {
    if (/^(auto|loop)/i.test(name)) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    }
  }
  return {
    mixer,
    has: (name) => actions.has(name),
    names: () => [...actions.keys()],
    play(name, { loop = false, clamp = true } = {}) {
      const a = actions.get(name);
      if (!a) return;
      a.reset();
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = clamp;
      a.play();
    },
    stop(name) {
      actions.get(name)?.stop();
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}
