import { describe, it, expect } from 'vitest';
import { buildScopeOfWork } from '../lib/scopeOfWork';
import { calculateBOM } from '../lib/calculateBOM';
import { calculateCameraBOM } from '../lib/calculateCameraBOM';
import { DEFAULT_INPUTS, DEFAULT_CAMERA_INPUTS } from '../lib/defaults';
import { BASE_PRODUCTS } from '../lib/catalog';
import { getTerminology } from '../lib/terminology';

// New proposals default to no technologies enabled; this suite describes a
// Wi-Fi system, so its baseline turns Wi-Fi on explicitly.
const WIFI_INPUTS = { ...DEFAULT_INPUTS, includeWifi: true };
const wifiBom = calculateBOM(WIFI_INPUTS, {}, {}, BASE_PRODUCTS);
const term = getTerminology('hospitality');

describe('buildScopeOfWork', () => {
  it('always describes the Wi-Fi network with AP/switch counts and generation', () => {
    const cameraBom = calculateCameraBOM(DEFAULT_CAMERA_INPUTS, {}, {}, BASE_PRODUCTS);
    const blocks = buildScopeOfWork({
      inputs: WIFI_INPUTS,
      cameraInputs: DEFAULT_CAMERA_INPUTS,
      wifiBom,
      cameraBom,
      term,
    });
    const wifi = blocks.find((b) => b.title === 'Managed Wi-Fi Network');
    expect(wifi).toBeTruthy();
    expect(wifi.text).toMatch(/Wi-Fi 6/);
    expect(wifi.text).toMatch(/access point/);
    expect(wifi.text).toMatch(/NSE3000/);
  });

  it('omits the surveillance block when there are no cameras', () => {
    const cameraBom = calculateCameraBOM(DEFAULT_CAMERA_INPUTS, {}, {}, BASE_PRODUCTS);
    const blocks = buildScopeOfWork({
      inputs: WIFI_INPUTS,
      cameraInputs: DEFAULT_CAMERA_INPUTS,
      wifiBom,
      cameraBom,
      term,
    });
    expect(blocks.find((b) => b.title === 'Video Surveillance System')).toBeUndefined();
  });

  it('describes the camera mix and retention when cameras are configured', () => {
    const cameraInputs = { ...DEFAULT_CAMERA_INPUTS, cam4mpTurret: 6, cam8mpBullet: 4, retention: 'month' };
    const cameraBom = calculateCameraBOM(cameraInputs, {}, {}, BASE_PRODUCTS);
    const blocks = buildScopeOfWork({ inputs: WIFI_INPUTS, cameraInputs, wifiBom, cameraBom, term });
    const cam = blocks.find((b) => b.title === 'Video Surveillance System');
    expect(cam).toBeTruthy();
    expect(cam.text).toMatch(/10 high-definition cameras/);
    expect(cam.text).toMatch(/4MP/);
    expect(cam.text).toMatch(/8MP/);
    expect(cam.text).toMatch(/one month/);
  });
});
