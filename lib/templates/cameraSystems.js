export const CAMERA_SYSTEMS = {
  id: 'system:camera-systems',
  name: 'IP Camera System Deployment',
  description:
    'End-to-end deployment template for IP security camera systems. Covers site survey, infrastructure cabling, NVR/VMS configuration, and client handoff.',
  technology: 'Video Surveillance',
  isSystem: true,
  phases: [
    {
      name: 'Phase 1 — Kickoff & Design',
      order: 0,
      tasks: [
        {
          name: 'Kickoff meeting with property stakeholders',
          description:
            'Schedule and conduct project kickoff. Review full scope of work — camera count, locations, retention requirements, and remote access needs. Establish key contacts (property manager, IT, security director). Confirm schedule, site access procedures, and escalation path. Document any existing surveillance system that will be decommissioned.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Physical security site survey',
          description:
            'Walk the entire site and photograph all planned camera locations: entrances, exits, parking areas, stairwells, hallways, elevators, common areas, and any interior locations per scope. Document field of view requirements (wide angle vs. telephoto), lighting conditions (day/night, backlighting), mounting height, and surface type (concrete, drywall, soffit). Identify NVR/server room location, existing conduit, and ISP/network entry points. Measure cable run distances from each camera to the nearest IDF or NVR.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Camera placement plan & system design',
          description:
            'Draft a camera layout drawing for each area. Specify camera model, mounting type (dome, bullet, turret, fisheye, PTZ), resolution, and lens per location. Design the NVR/VMS architecture: number of NVR channels, storage capacity calculation (frame rate × resolution × retention days × camera count), RAID level, and remote access VPN or P2P method. Document IP addressing plan. Specify PoE switch requirements and UPS runtime needs.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Design review & customer sign-off',
          description:
            'Present camera placement plan and system design to the customer. Walk through each camera location on the site map and explain coverage rationale. Review storage retention period, remote access method, and alert/motion configuration plan. Document any requested changes. Obtain written approval (signed SOW or email confirmation) before ordering equipment.',
          duration_days: 0.5,
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
            'Place PO for all hardware: IP cameras (per approved model list), NVR or server, PoE switches, UPS, hard drives (NAS-rated, e.g., Seagate SkyHawk or WD Purple), mounting brackets, junction boxes, CAT6 cable, conduit, and any fiber uplinks. Verify part numbers against the approved BOM and quote number. Confirm NVR channel license count matches camera count.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Confirm order & schedule delivery',
          description:
            'Verify order acknowledgment from distributor. Confirm all part ETAs, flag back-orders or substitutions, and validate camera firmware revision compatibility with the NVR/VMS version. Schedule delivery to the site or staging warehouse. Coordinate delivery window with the property.',
          duration_days: 0.5,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Receive, inspect & stage equipment',
          description:
            'Check in all delivered equipment against the PO line by line. Inspect cameras and NVR for shipping damage — photograph and file claims for any damage. Inventory serial numbers. Pre-install hard drives in the NVR and verify the NVR powers on and detects all drives before going to site. Update NVR firmware to the current stable release.',
          duration_days: 1,
          role: 'Field Tech',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 3 — Infrastructure Installation',
      order: 2,
      tasks: [
        {
          name: 'NVR/server room preparation',
          description:
            'Prepare the NVR room or security rack: verify dedicated power circuit (20A minimum), adequate ventilation, and physical security (locked room or locking rack). Install rack, cable management, and a UPS sized for at least 30 minutes of runtime for the NVR and core switch. Label the circuit breaker feeding the rack.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Conduit installation',
          description:
            'Install conduit from the NVR room/IDF to all camera locations per the design. Use 3/4" EMT in finished interior areas, rigid or IMC outdoors or in mechanical spaces. Pull a pull string in all conduit. Install weatherproof junction boxes at all exterior camera locations. Seal all exterior conduit penetrations with waterproof foam or caulk to prevent moisture intrusion.',
          duration_days: 2,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Pull & terminate CAT6 drops',
          description:
            'Pull CAT6A (or CAT6 minimum) cable from each camera location to the PoE switch. Leave 12" service loop at the camera end inside the junction box. Terminate the switch end with RJ45 (T568B) and dress into the patch panel. Test each run with a cable tester and document pass/fail. Label both ends of every cable with the camera ID.',
          duration_days: 2,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Install & configure PoE switch(es)',
          description:
            'Mount PoE switch(es) in the NVR rack or IDF as designed. Connect uplink to the NVR switch or LAN. Assign a static management IP. Verify each PoE port delivers sufficient wattage for the connected camera model (check PoE budget: total camera draw vs. switch PoE capacity). Label all occupied ports.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 4 — Camera Installation',
      order: 3,
      tasks: [
        {
          name: 'Mount camera housings & junction boxes',
          description:
            'Mount junction boxes or surface conduit bodies at each camera location at the correct height and angle per the design. For PTZ cameras, install the correct pendant or wall mount and verify the mount can support the camera weight. For outdoor cameras, apply conduit sealant at all entries and use weatherproof gaskets.',
          duration_days: 1,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Connect & mount cameras',
          description:
            'Terminate the CAT6 drop at each camera with a field-terminated RJ45 or camera pigtail. Connect to the camera base. Apply weatherproof boot on outdoor connections. Mount camera and aim at the intended coverage zone per the design drawing. Power on via PoE and verify the LED/status indicator shows the camera is receiving power.',
          duration_days: 2,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Install NVR and connect to network',
          description:
            'Rack-mount or place the NVR in its permanent location. Connect to the PoE switch(es) and to the LAN/management switch. Power on and verify all hard drives are detected. Set the NVR IP address, subnet, gateway, and DNS per the IP addressing plan. Change the default admin password.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 5 — NVR/VMS Configuration',
      order: 4,
      tasks: [
        {
          name: 'Add cameras to NVR/VMS',
          description:
            'Use the NVR auto-discovery or manually add each camera by IP address. Assign each camera a descriptive channel name matching the design drawing (e.g., "Front Entrance East", "Parking Lot B — North"). Set each camera\'s resolution, frame rate (15–30 fps recommended), and video codec (H.265+ preferred for storage efficiency). Confirm all channels show live video.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Configure recording schedules & storage',
          description:
            'Set continuous recording on all channels (or scheduled recording per customer preference). Verify total storage capacity meets the required retention period at the configured resolution and frame rate. Enable SMART HDD monitoring. Set the recording mode to overwrite oldest footage when disk is full. Configure RAID if applicable and verify array health.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Configure motion detection & alerts',
          description:
            'Draw motion detection zones for each camera — exclude trees, flags, and high-traffic areas that would generate false positives. Set sensitivity threshold appropriate for each scene. Configure alert actions: email notification to customer security contact, push notification in VMS app, and/or relay output trigger if door alarms are integrated. Test each motion zone with a walk-through.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Configure remote access',
          description:
            'Set up remote viewing access per design: VPN tunnel to the NVR LAN, P2P cloud relay (e.g., Hikvision Hik-Connect, Dahua DMSS, or Axis Companion), or DDNS with port forwarding (least preferred). Install the mobile app on the customer\'s phone and confirm live view, playback, and PTZ control function remotely. Document all access credentials in the handoff package.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 3,
        },
        {
          name: 'PTZ presets & auto-patrol configuration',
          description:
            'For any PTZ cameras: set named presets at all key coverage positions (e.g., "License Plate Zone", "Lobby Desk", "North Gate"). Configure auto-patrol schedule if required. Set park position (default return position after manual pan). Test preset recall speed and accuracy.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 4,
        },
      ],
    },
    {
      name: 'Phase 6 — Testing & QA',
      order: 5,
      tasks: [
        {
          name: 'Camera image quality verification',
          description:
            'Review live video on every channel. Verify each camera covers its intended zone. Adjust camera angle and focus for any channels that are misaligned or out of focus. Confirm WDR (wide dynamic range) is enabled on cameras facing windows, doors with backlight, or high-contrast areas. Verify night-vision IR activates in low light. Photograph the live image of each camera channel for the as-built documentation.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Recording & playback verification',
          description:
            'Verify all cameras are actively recording by reviewing the recording status icon on each channel in the NVR. Trigger a 10-minute recording period, then use the playback function to retrieve and review footage for at least 5 representative cameras. Confirm timestamps are accurate (sync NVR to NTP). Verify exported clips play back with correct audio (if cameras include audio).',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Motion & alert testing',
          description:
            'Walk through each motion detection zone and verify alerts are triggered. Confirm alert emails are received by the customer contact within 30 seconds. Test push notification delivery on the VMS mobile app. Verify that scheduled or time-restricted motion alerts (e.g., after-hours only) function as configured.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Punch list & remediation',
          description:
            'Compile all issues found during testing: cameras with poor image quality, motion zones with false positives, remote access failures, storage shortfalls, or missing channels. Assign remediation owners and completion dates. Resolve all items before scheduling handoff. Document final pass status for each camera channel.',
          duration_days: 0.5,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 7 — Handoff & Closeout',
      order: 6,
      tasks: [
        {
          name: 'Customer & staff training',
          description:
            'Conduct hands-on training with the designated security administrator and any on-site staff who will use the system. Cover: live view navigation, multi-channel display layouts, playback and clip export, PTZ control, motion alert review, mobile app usage, and how to submit a support request to FSG. Confirm all trainees can independently view live video and retrieve a 24-hour-old clip before training is complete.',
          duration_days: 1,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Deliver as-built documentation',
          description:
            'Compile and deliver the complete handoff package: (1) Camera placement map with each camera numbered and labeled. (2) Channel name list and corresponding physical location. (3) IP addressing table for all devices. (4) NVR and camera login credentials (stored securely). (5) Remote access setup instructions and app download links. (6) Equipment serial numbers and warranty expiry dates. (7) FSG support contact information and escalation path.',
          duration_days: 0.5,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Project closeout',
          description:
            'Issue final invoice per contract. Close all open time entries and mark project complete in FSG OS. Update the CRM account record with deployment notes, camera count, NVR model, and support tier. Start the warranty/support period in the system. Schedule a 30-day check-in call to confirm the customer is satisfied with image quality and recording performance. Archive all project documentation.',
          duration_days: 0.5,
          role: 'PM',
          order: 2,
        },
      ],
    },
  ],
};
