// Kafes: "Cage" + "Cage_Button". Butona basınca aşağı iner, tekrar basınca yukarı çıkar.
// Mesafe / süre / yön: config.js → GAME_CONFIG.cage (veya nesnenin Blender özelliklerinden).
// İçindeki oyuncular kafesle birlikte hareket eder (World.getRideDelta).
import { GAME_CONFIG } from './config.js';
import { MoverSystem } from './kinematic.js';

export class CageSystem extends MoverSystem {
  constructor(world, cageEntries, buttonEntries) {
    super(world, {
      k: 'cage',
      entries: cageEntries,
      buttons: buttonEntries,
      defaults: GAME_CONFIG.cage,
      labels: { open: 'Kafesi indir', close: 'Kafesi kaldır' },
      platform: true,
    });
  }
}
