export const MULTIFAMILY_WIFI = {
  id: 'system:multifamily-wifi',
  name: 'Multi-Family Wi-Fi Deployment',
  description:
    'End-to-end deployment template for managed Wi-Fi in apartment communities, condos, and senior living. Covers kickoff through resident go-live.',
  technology: 'Managed Wi-Fi',
  isSystem: true,
  phases: [
    {
      name: 'Phase 1 — Kickoff & Planning',
      order: 0,
      tasks: [
        {
          name: 'Kickoff meeting with property management',
          description:
            'Schedule and conduct project kickoff meeting. Review full scope of work, establish communication protocols, confirm key contacts (property manager, maintenance lead), align on schedule, resident access requirements, and escalation path.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Site survey — building walkthrough',
          description:
            'Walk entire property floor by floor. Document building layouts, unit counts, hallway distances, and planned AP locations. Identify MDF/IDF rooms, existing conduit, and ISP entry points. Photograph all equipment rooms. Estimate cable run lengths per building.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Network design & AP placement plan',
          description:
            'Create AP placement design — one per unit for residential, coverage-based for common areas. Document VLAN structure (Management 10, Resident 100, IoT 200, Guest 300). Design switch-uplink architecture per building. Calculate cable quantities. Specify QoS policy and per-unit bandwidth tiers.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Design review & customer sign-off',
          description:
            'Present network design to property owner/manager. Review AP placement map, SSID plan, VLAN diagram, and pricing. Gather feedback, incorporate revisions. Obtain written approval (signed SOW or email confirmation) before ordering equipment.',
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
          name: 'Submit purchase order to distributor',
          description:
            'Place PO for all hardware: APs (Wi-Fi 6 or Wi-Fi 7 per design), PoE edge switches, aggregate switch, NSE gateway, UPS, rack(s), SFP transceivers, fiber patch cables, and all copper cabling. Verify part numbers against the approved BOM. Reference the approved quote number on the PO.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Confirm order & schedule delivery',
          description:
            'Verify order acknowledgment from distributor. Confirm all part ETAs and flag any back-orders or substitutions. Schedule delivery to project site or staging warehouse. Coordinate delivery window with property manager.',
          duration_days: 0.5,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Receive, inspect & stage equipment',
          description:
            'Check in all delivered equipment against the PO line by line. Inspect for shipping damage — photograph any damaged items and file a claim. Inventory and stage equipment by building. Pre-stage AP firmware updates at the warehouse if possible.',
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
          name: 'MDF/IDF room preparation',
          description:
            'Clear and clean all equipment rooms. Verify adequate dedicated power circuits (20A minimum per rack). Confirm proper ventilation or HVAC. Install a ground bar if required. Label all circuit breakers feeding the room. Ensure room locks are functional.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Install rack(s)',
          description:
            'Mount floor racks (or wall racks per design) and secure to floor anchors per manufacturer specs and local code. Install horizontal and vertical cable management. Dress rack with blanking panels for unused U spaces. Ground rack to building ground.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Install UPS',
          description:
            'Rack-mount the PSI5 UPS. Connect to dedicated 20A circuit. Connect network management card and set IP address. Verify battery status and estimated runtime. Set low-battery warning threshold in management software.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Install aggregate / core switch',
          description:
            'Mount EX3024F aggregate switch in MDF rack. Install SFP transceivers in all uplink ports. Patch fiber uplinks from each IDF. Verify all fiber links are active (green port LEDs). Label all ports. Set management IP.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 3,
        },
        {
          name: 'Install gateway / router',
          description:
            'Mount NSE gateway in MDF rack. Connect ISP handoff to WAN interface. Connect LAN interface to core switch uplink. Verify internet connectivity end-to-end. Change all default credentials. Disable unused management services.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 4,
        },
        {
          name: 'Install PoE edge switches',
          description:
            'Mount EX2028-P or EX2052-P PoE switches in each IDF location per the design. Connect uplinks to core switch (copper or SFP). Verify uplink is active. Set management IP per addressing table. Label switch chassis and all ports per labeling standard.',
          duration_days: 2,
          role: 'Field Tech',
          order: 5,
        },
        {
          name: 'Fiber backbone — MDF to IDFs',
          description:
            'Pull and terminate OS2 or OM4 fiber backbone between MDF and each IDF if not pre-installed. Test all strands with a power meter or OTDR. Document test results. Label fiber at both ends.',
          duration_days: 1,
          role: 'Field Tech',
          order: 6,
        },
        {
          name: 'Cable management & labeling',
          description:
            'Dress all rack cables using Velcro wrap straps. Label all patch cables at both ends (switch port ID → destination device or AP unit number). Apply port labels to all switch faceplates. Photograph completed rack installations for as-built documentation.',
          duration_days: 1,
          role: 'Field Tech',
          order: 7,
        },
      ],
    },
    {
      name: 'Phase 4 — AP Installation',
      order: 3,
      tasks: [
        {
          name: 'Coordinate unit access with property',
          description:
            'Provide 48-hour advance written notice to property manager for unit entry. Confirm the building-by-building schedule. Post door notices for residents as required by lease. Confirm maintenance staff availability for locked units on each installation day.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Pull & terminate drops — common areas',
          description:
            'Pull CAT6 from the nearest IDF switch to each AP location in lobbies, hallways, elevator machine rooms, pool, clubhouse, and amenity spaces. Terminate with keystone jacks or field-terminated RJ45 at both ends. Test each drop with a cable tester and log pass/fail.',
          duration_days: 2,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Pull & terminate drops — residential units',
          description:
            'Pull in-unit CAT6 drop from floor patch panel or junction box to the planned AP location (bedroom or living room ceiling/wall per design). Terminate both ends. Test each drop. Mark any drops that need re-pulls on the unit map.',
          duration_days: 3,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Mount & connect APs — common areas',
          description:
            'Mount ceiling APs (XV2-21X or XV3-21X) at designed locations using the appropriate bracket. Connect CAT6 drop and verify PoE link lights on both AP and switch port. Label each AP with its location ID and log the MAC address in the inventory sheet.',
          duration_days: 1,
          role: 'Field Tech',
          order: 3,
        },
        {
          name: 'Mount & connect APs — residential units',
          description:
            'Mount in-unit APs: wallplate (XV2-22H or XV3-22H) flush-mounted in standard wall box, or ceiling mount (XV2-21X) per unit design. Connect drop and verify PoE. For wallplate APs, use a 3-inch no-boot pigtail. Label each AP with unit number.',
          duration_days: 2,
          role: 'Field Tech',
          order: 4,
        },
      ],
    },
    {
      name: 'Phase 5 — Network Configuration',
      order: 4,
      tasks: [
        {
          name: 'Configure VLANs & inter-VLAN routing',
          description:
            'Create VLANs on gateway and all switches: VLAN 10 (Management), VLAN 100 (Resident), VLAN 200 (IoT), VLAN 300 (Guest). Configure inter-VLAN routing on the NSE gateway with ACLs isolating resident subnets from each other. Set DHCP scopes for all VLANs. Verify DHCP leases on each VLAN.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Register APs in cnMaestro & build site hierarchy',
          description:
            'Claim all APs in cnMaestro X using serial numbers or MAC addresses. Build the site hierarchy: System → Site → Building → Floor. Name each AP with its unit number and location (e.g., "Bldg A – Unit 204 – Bedroom"). Assign each AP to the correct AP group.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Configure SSIDs',
          description:
            'Create SSIDs in cnMaestro: (1) Resident SSID — WPA3-Personal with unique per-unit PSK (or WPA3-Enterprise with RADIUS for MDU). Tag to VLAN 100. (2) Management SSID — WPA3, restricted to IT VLAN 10. (3) Guest SSID — open with captive portal, tagged VLAN 300. Apply SSID-to-VLAN mapping in AP group config.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Configure QoS & bandwidth policies',
          description:
            'Set per-unit download/upload rate limits per contract (typically 100/100 Mbps residential or as specified). Enable airtime fairness on all APs. Configure DSCP marking for voice/video priority (EF for VoIP, AF41 for video). Apply rate limiting policy on guest SSID.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 3,
        },
        {
          name: 'Configure guest captive portal',
          description:
            'Set up the guest splash page in cnMaestro: upload property logo and brand colors. Configure Terms of Service acceptance flow. Set session timeout (8 hours default). Configure walled garden domains. Optional: enable SMS verification for accountability. Test portal on iOS, Android, and Windows devices.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 4,
        },
        {
          name: 'Push config & verify all APs online',
          description:
            'Deploy full configuration to all APs via cnMaestro. Wait for all APs to check in (green status). Investigate any APs that fail to register (check PoE power, VLAN tagging, cable continuity). Do not proceed until 100% of APs are online and receiving configuration.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 5,
        },
        {
          name: 'Configure monitoring & alerting',
          description:
            'Enable cnMaestro alert rules: AP offline (5-minute threshold), channel utilization >80%, excessive client deauthentications. Set notification email recipients to the FSG NOC and property contact. Configure dashboard widgets for this property. Enable syslog forwarding if applicable.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 6,
        },
      ],
    },
    {
      name: 'Phase 6 — Testing & QA',
      order: 5,
      tasks: [
        {
          name: 'Per-unit connectivity test',
          description:
            'In each unit, connect a test device to the resident SSID using the unit\'s PSK. Verify DHCP assignment on VLAN 100 (correct subnet). Verify internet access. Confirm the device cannot reach other residents\' IP ranges (ARP isolation or subnet separation). Log pass/fail per unit in the test sheet.',
          duration_days: 2,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Speed & coverage testing',
          description:
            'Run Ookla Speedtest or iPerf3 from a laptop in each unit and key common areas. Record download/upload/latency. Flag units with <25 Mbps down or >50ms latency for investigation. Walk hallways and common areas with a Wi-Fi analyzer — target RSSI >-70 dBm across 80% of coverage area.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Guest network & portal test',
          description:
            'Connect to the guest SSID from multiple devices (phone, laptop, tablet). Verify the captive portal loads. Accept ToS and verify internet access. Confirm bandwidth throttle is active. Verify guest cannot ping any resident or management device. Confirm session timeout behavior.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Punch list & remediation',
          description:
            'Compile all issues found during testing (signal gaps, VLAN misassignment, slow speeds, portal issues, cabling failures). Assign remediation owners and estimated completion date. Complete all punch list items. Obtain property manager sign-off that all issues are resolved before scheduling handoff.',
          duration_days: 1,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 7 — Handoff & Go-Live',
      order: 6,
      tasks: [
        {
          name: 'Update cnMaestro labels & finalize inventory',
          description:
            'Finalize all AP labels in cnMaestro (unit number, floor, building). Export AP inventory report from cnMaestro. Update the IP address tracking spreadsheet with all assigned device IPs, MAC addresses, and switch port assignments.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Deliver as-built documentation',
          description:
            'Compile and deliver to the customer: (1) As-built floor plan with AP locations marked per building. (2) IP addressing table for all network devices and APs. (3) SSID names, per-unit credentials, and QR codes if applicable. (4) Cable label map. (5) Equipment serial numbers and warranty expiry dates. (6) Vendor/FSG support contact information and escalation path.',
          duration_days: 1,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Property management training',
          description:
            'Conduct training with on-site manager covering: (1) Resident Wi-Fi help card procedure — what to do when a resident calls about Wi-Fi. (2) How to submit a support case to FSG (portal, email, or phone). (3) What is proactively monitored and how FSG responds to outages. (4) Quarterly report cadence. Provide a printed quick-reference guide for the office.',
          duration_days: 1,
          role: 'PM',
          order: 2,
        },
        {
          name: 'Go-live resident notification',
          description:
            'Coordinate with property to communicate the activation date to residents. Distribute door hangers or send a building-wide email containing: Wi-Fi SSID name, per-unit password or QR code, FSG support contact number/email, and basic troubleshooting tips. Confirm property manager has distributed all materials.',
          duration_days: 0.5,
          role: 'PM',
          order: 3,
        },
        {
          name: 'Project closeout',
          description:
            'Issue final invoice per contract. Close all open time entries and mark project complete in FSG OS. File completed project record in CRM with deployment notes. Start the warranty/support period clock in the system. Schedule a 30-day check-in call with the property manager. Archive all project documentation to the shared drive.',
          duration_days: 0.5,
          role: 'PM',
          order: 4,
        },
      ],
    },
  ],
};
