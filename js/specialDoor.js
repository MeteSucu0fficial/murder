// Hareketli duvar / ikinci kapı: "Special_Door" + "Special_Door_Button".
// Başlangıç konumu, hareket mesafesi, süre ve yön: config.js → GAME_CONFIG.specialDoor.
import { GAME_CONFIG } from './config.js';
import { MoverSystem } from './kinematic.js';

export class SpecialDoorSystem extends MoverSystem {
  constructor(world, doorEntries, buttonEntries) {
    super(world, {
      k: 'specialDoor',
      entries: doorEntries,
      buttons: buttonEntries,
      defaults: GAME_CONFIG.specialDoor,
      labels: { open: 'Duvarı aç', close: 'Duvarı kapat' },
      platform: false,
    });
  }
}
