export const AUDIO_VISUAL = {
  id: 'system:audio-visual',
  name: 'Audio / Visual System Deployment',
  description:
    'End-to-end deployment template for AV systems in conference rooms, common areas, and multipurpose spaces. Covers design, rack build, display/speaker installation, DSP programming, and customer training.',
  technology: 'Audio/Video',
  isSystem: true,
  phases: [
    {
      name: 'Phase 1 — Discovery & Design',
      order: 0,
      tasks: [
        {
          name: 'Kickoff & discovery meeting',
          description:
            'Meet with the customer to define the full scope: number and type of spaces (conference rooms, boardrooms, lobbies, huddle spaces, training rooms, auditorium), use cases (video conferencing, digital signage, presentation, background music, live event), budget parameters, and preferred technology brands or existing standards. Identify key stakeholders: IT, A/V champion, facilities, and end users. Confirm schedule and site access. Document any existing A/V equipment being replaced or integrated.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Site survey & acoustic assessment',
          description:
            'Walk every space in scope. Measure room dimensions and ceiling height. Assess room acoustics: note hard vs. soft surfaces, HVAC noise levels, ambient noise sources (mechanical rooms, lobbies), and reverberation characteristics. Photograph each space from all four corners. Identify display wall locations, projector throw distances, speaker mounting options (ceiling, wall, surface), rack or credenza locations, and cable routing paths. Confirm electrical circuit availability for all new equipment. Measure maximum projector throw distance and minimum/maximum screen size for each space.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'System design & signal flow diagram',
          description:
            'Design each space: specify display type and size (LCD, LED, laser projector), video switching architecture (matrix switcher, room controller with HDMI/USB-C inputs, or cloud-based), audio DSP model, amplifier power requirements, speaker type and count per room, microphone solution (boundary, ceiling array, speakerphone, or wireless), and control system (touch panel, button panel, or app-based). Create a signal flow diagram for each space showing all sources, signal paths, switchers, DSP, amplifiers, and outputs. Calculate amplifier power budget: speaker impedance, SPL target, and room size.',
          duration_days: 2,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Design review & customer sign-off',
          description:
            'Present designs for all spaces to the customer. Walk through the signal flow for each space, explain equipment selections and use-case coverage. Review the control system user interface concept. Confirm video conferencing platform compatibility (Zoom Rooms, Microsoft Teams Rooms, Google Meet, or Cisco). Identify any rooms requiring an IT network drop for codecs or control systems. Obtain written approval on equipment and pricing before ordering.',
          duration_days: 1,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 2 — Procurement',
      order: 1,
      tasks: [
        {
          name: 'Submit purchase order',
          description:
            'Place PO for all equipment: displays, projectors, screens, video matrix switchers or room systems, DSP processors, power amplifiers, speakers, microphones, touch panels or control processors, media players or signage players, cable (HDMI, DisplayPort, CAT6, speaker wire, SpeakON, XLR, RJ45), conduit, rack units, power conditioners, and all mounting hardware. Verify all HDMI cable lengths are rated for the specified resolution and refresh rate (fiber HDMI for runs >15m). Reference the approved BOM and quote number.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Confirm order & manage lead times',
          description:
            'Verify order acknowledgment. Flag any back-orders — DSP processors, control systems, and commercial displays can have 4–8 week lead times. If any items are on extended back-order, notify the customer immediately and identify suitable substitutions. Schedule delivery to a staging location to allow for pre-build and pre-configuration before installation.',
          duration_days: 0.5,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Receive, inspect & begin rack staging',
          description:
            'Check in all equipment against the PO. Inspect for shipping damage. Photograph any damage and file claims. Begin rack pre-build in the staging area: mount all rack equipment, install power strips and cable management, label all rack units. Update all device firmware (DSP, control processor, media players, displays) to current stable releases before going to site.',
          duration_days: 1,
          role: 'Field Tech',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 3 — Infrastructure & Rough-In',
      order: 2,
      tasks: [
        {
          name: 'Install conduit & cable pathways',
          description:
            'Install conduit between all equipment locations in each room: from the rack or credenza position to all display wall plates, ceiling speakers, projector location, microphone drops, and control touch panel. Use 1" EMT for video/control cable runs and 3/4" for speaker and microphone cable. Install wiremold or surface raceway in finished spaces where in-wall conduit is not feasible. Pull pull strings in all conduit. Label all conduit at both ends.',
          duration_days: 2,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Pull & label all cable',
          description:
            'Pull all signal cable through conduit: HDMI, DisplayPort, or fiber HDMI for video; CAT6 for network and HDBT extenders; XLR or balanced analog for audio; SpeakON or 14 AWG for speaker lines; CAT6 for control touch panels; USB extension cable for camera/audio bars. Leave 18" service loops at all device end points. Label every cable at both ends using the room ID and signal type (e.g., "CONF-B — HDMI SRC1", "CONF-B — SPK-L").',
          duration_days: 2,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Prepare display mounting locations',
          description:
            'Locate and mark studs or concrete anchors for all wall-mount displays. Install blocking behind drywall if studs do not align with the mount pattern. For ceiling-mount projectors, install structural backing or use the existing ceiling grid structure rated for the projector weight. Pre-wire power outlet at the mount location if required. Install conduit chase from mount to rack or credenza location.',
          duration_days: 1,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Install speaker rough-in & backboxes',
          description:
            'Cut and install ceiling or wall speaker back-boxes at all designed speaker locations. Pull speaker cable to each back-box. For ceiling speakers, cut holes to the speaker manufacturer\'s template size. For pendant or surface speakers, install mounting brackets. Install microphone ceiling-mount plates or junction boxes for table microphone cable drops. Verify each speaker location aligns with the acoustic model and does not conflict with HVAC diffusers or sprinkler heads.',
          duration_days: 1,
          role: 'Field Tech',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 4 — Equipment Installation',
      order: 3,
      tasks: [
        {
          name: 'Mount & connect displays and projectors',
          description:
            'Mount all displays using the specified wall mounts or ceiling mounts. Torque all bolts to the mount manufacturer\'s specifications. Connect HDMI or fiber HDMI, power, and RS-232 or IP control cable at each display. For projectors, mount the projector bracket at the calculated throw distance, connect HDMI and power, and install the projection screen. Level all displays — use a digital level. Verify the display powers on and shows input.',
          duration_days: 1,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Install speakers & microphones',
          description:
            'Install ceiling or wall speakers into the rough-in locations. Connect and polarize speaker cables (verify + and − match the amplifier output). For pendant or surface speakers, complete final mounting. Install boundary microphones on conference tables, ceiling array microphones at the designed height (typically 9–10 ft AFF), or wireless receiver/transmitter systems per the design. Dress all microphone cables and apply strain relief.',
          duration_days: 1,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Place & connect rack or credenza',
          description:
            'Place the pre-built equipment rack or credenza in its permanent position. Route all pulled cable into the rack through grommeted openings. Terminate all cable on the rack: HDMI to the switcher inputs/outputs, balanced audio to the DSP I/O, speaker cable to the amplifier outputs, CAT6 to the network switch and control processor, and power to the power conditioner/UPS. Apply final cable labels at rack termination. Verify rack cable management is clean and serviceable.',
          duration_days: 1,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Install control touch panels & button panels',
          description:
            'Install tabletop or wall-mount touch panels at each designed location. Connect Ethernet (for IP-based control systems) or the control cable to the control processor. Install any fixed button panels (e.g., volume up/down, scene select). Apply faceplates and verify each panel powers on and connects to the control processor. Label all panel locations.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 5 — DSP & Control Programming',
      order: 4,
      tasks: [
        {
          name: 'DSP programming & tuning',
          description:
            'Program the audio DSP (e.g., QSC Q-SYS, Biamp Tesira, BSS Audio, or Symetrix) for each space: configure inputs (microphone preamp gain, phantom power), processing blocks (EQ, compressor, noise gate, automatic gain control, acoustic echo cancellation for video conferencing), routing matrix, output signal flow (DSP out → amplifier → speakers), and level control. Set room combining logic if applicable. Export and save the DSP design file.',
          duration_days: 2,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Speaker tuning & acoustic optimization',
          description:
            'Use a calibrated measurement microphone (e.g., Earthworks M30 or similar) and room measurement software (Rational Acoustics Smaart, QSC QSYS Reflect, or equivalent) to measure the frequency response at multiple audience positions. Apply EQ correction in the DSP to achieve a ±3 dB response from 80 Hz–16 kHz. Set amplifier gain to achieve the designed SPL target (typically 75–85 dB SPL continuous in conference rooms, higher in lobby or auditorium). Verify system is free of hum, buzz, or oscillation.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Control system programming',
          description:
            'Program the room control system (Crestron, Extron, AMX, QSC Q-SYS, or Lutron) with the customer-approved user interface: power on/off sequence (displays, sources, audio), source selection buttons, volume control, microphone mute, lighting presets (if integrated), and any room scheduling display integration. Program startup and shutdown macros with correct timing delays for each device. Ensure power sequencing protects amplifiers and displays (speakers mute before power-off).',
          duration_days: 2,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Video conferencing platform configuration',
          description:
            'For rooms with video conferencing (Zoom Rooms, Microsoft Teams Rooms, or Cisco Webex): install and license the room system software on the codec or PC. Pair the room controller/touch panel with the conferencing platform. Configure the camera (field of view, auto-framing settings), microphone (acoustic echo cancellation, noise suppression), and speaker routing within the platform settings. Join a test call from the room and verify the far end sees and hears the room correctly. Test content sharing from both wired (HDMI) and wireless (AirPlay, Miracast, or Clickshare) inputs.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 6 — Testing & QA',
      order: 5,
      tasks: [
        {
          name: 'End-to-end signal chain test — all rooms',
          description:
            'In each room, test every input source through every output: connect a laptop to each input (HDMI wall plate, table box, wireless presentation receiver) and verify the image displays on the primary display and secondary display (if applicable) at the full native resolution. Verify video switching and source selection function from the touch panel. Test signal integrity — no flicker, no handshaking delays, no HDCP errors.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Audio performance test',
          description:
            'Play pink noise through the system and verify SPL is consistent across the audience area with no dead spots or hot spots greater than ±6 dB. Speak into all microphones and verify the far-end hearing the audio (for conferencing) or that the PA system has appropriate gain-before-feedback margin (minimum 6 dB). Test microphone mute buttons and verify mute LED behavior. Verify there is no echo, noise, or feedback under normal operating conditions.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Control system & automation test',
          description:
            'Press every button on the touch panel and verify correct behavior. Test the full room power-on sequence: confirm all devices power on in the correct order and all inputs are available within the specified time. Test the power-off sequence: confirm displays and amplifiers power down safely. Test any scheduled automation (e.g., system auto-off after hours). Verify lighting control presets if integrated.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Punch list & remediation',
          description:
            'Compile all issues: signal path problems, acoustic issues, control malfunctions, cosmetic deficiencies (crooked displays, visible cables, missing faceplates), or software configuration errors. Assign remediation owners and completion dates. Resolve all items before scheduling customer acceptance. Re-test any affected rooms after remediation.',
          duration_days: 1,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 7 — Handoff & Training',
      order: 6,
      tasks: [
        {
          name: 'End-user training',
          description:
            'Conduct hands-on training for room users. Keep it practical and brief (15–20 minutes per room type). Cover: powering the room on and off, selecting a source, adjusting volume, muting the microphone, sharing content wirelessly, starting a video conference call, and basic troubleshooting (what to do if the display is not showing the laptop, how to restart the room system). Provide a one-page quick-start guide posted in each room.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Administrator training',
          description:
            'Conduct deeper training with the IT administrator or A/V manager. Cover: accessing the DSP software remotely, adjusting EQ or levels, updating control system code, monitoring devices on the network, adding a new input source, and how to submit a support request to FSG. Provide login credentials for all systems. Confirm the admin can independently log in to the DSP and control system before training is complete.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Deliver as-built documentation',
          description:
            'Compile and deliver the full handoff package: (1) As-built signal flow diagram for each room. (2) Equipment list with model numbers, serial numbers, and firmware versions. (3) IP address table for all networked devices. (4) DSP design file backup (exported from DSP software). (5) Control system program backup. (6) Speaker tuning measurement reports. (7) Cable label schedule. (8) All admin credentials stored securely. (9) FSG support contact and escalation path.',
          duration_days: 1,
          role: 'PM',
          order: 2,
        },
        {
          name: 'Project closeout',
          description:
            'Issue final invoice per contract. Close all open time entries and mark project complete in FSG OS. Update the CRM account record with room count, system type, DSP model, and control platform. Start the warranty period clock. Schedule a 30-day check-in to confirm the system is performing well and staff are comfortable using it. Archive all documentation, DSP files, and control system backups to the shared project folder.',
          duration_days: 0.5,
          role: 'PM',
          order: 3,
        },
      ],
    },
  ],
};
