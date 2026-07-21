// Builds a plain-language, customer-facing scope of work from the configured
// systems, so a proposal reader can tell exactly what they're paying for.
// Pure function → returns [{ title, text }] blocks.

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function buildScopeOfWork({ inputs, cameraInputs, wifiBom, cameraBom, term }) {
  const blocks = [];

  // --- Managed Wi-Fi (omitted on a camera-only quote) ---
  if (wifiBom.totalAPs > 0) {
    const gen = inputs.wifiGeneration === 'wifi7' ? 'Wi-Fi 7' : 'Wi-Fi 6';
    const unit = (term?.summaryUnit || 'unit').toLowerCase();
    const switches = wifiBom.totalIdfSwitches + (wifiBom.needsAggSwitch ? 1 : 0);
    const deploy =
      inputs.deploymentType === 'inroom' || inputs.deploymentType === 'wall'
        ? 'wall-mounted'
        : 'ceiling-mounted';
    const idfs = Math.max(1, Number(inputs.numberOfIDFs) || 1);

    blocks.push({
      title: 'Managed Wi-Fi Network',
      text:
        `A fully managed ${gen} wireless network engineered to deliver reliable, high-density coverage ` +
        `for ${plural(inputs.numberOfRooms, unit)}. The design deploys ${plural(wifiBom.totalAPs, 'Wi-Fi access point')} ` +
        `using a ${deploy} coverage strategy, aggregated by ${plural(switches, 'managed PoE switch')} ` +
        `across ${plural(idfs, 'network closet')} and protected by a ${inputs.gatewayModel} security gateway/router with content ` +
        `filtering and guest/private network separation. Every access point and switch includes a 5-year cloud ` +
        `management and support subscription, and the system is delivered with all required mounting hardware, ` +
        `patch cabling, and rack components.`,
    });
  }

  // --- Video Surveillance (only if cameras configured) ---
  if (cameraBom.totalCameras > 0) {
    const n4 = (Number(cameraInputs.cam4mpBullet) || 0) + (Number(cameraInputs.cam4mpTurret) || 0);
    const n8 = (Number(cameraInputs.cam8mpBullet) || 0) + (Number(cameraInputs.cam8mpTurret) || 0);
    const mix = [];
    if (n4) mix.push(`${n4} × 4MP (1080p-class)`);
    if (n8) mix.push(`${n8} × 8MP (4K)`);
    const retention =
      cameraInputs.retention === 'week'
        ? 'approximately one week'
        : 'approximately one month';

    blocks.push({
      title: 'Video Surveillance System',
      text:
        `A complete IP video surveillance system comprising ${plural(cameraBom.totalCameras, 'high-definition camera')} ` +
        `(${mix.join(' and ')}) recording continuously to ${plural(cameraBom.nvrCount, '8-channel PoE network video recorder')}. ` +
        `On-board storage is sized for ${retention} of continuous 24/7 retention. The scope includes professional ` +
        `camera mounting and aiming, recorder configuration, remote-viewing setup, and full system verification.`,
    });
  }

  // --- Services & terms ---
  blocks.push({
    title: 'Professional Services & Support',
    text:
      `Our team provides end-to-end project management, equipment procurement, on-site installation, configuration, ` +
      `and validation testing for all equipment listed above. All hardware is delivered, mounted, and verified ` +
      `fully operational before hand-off, and documentation is provided on completion. Pricing is a budgetary ` +
      `estimate, includes shipping & handling, and is valid for 30 days.`,
  });

  return blocks;
}
