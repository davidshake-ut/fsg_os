export const SMART_APARTMENT = {
  id: 'system:smart-apartment',
  name: 'Smart Apartment IoT Rollout',
  description:
    'Unit-by-unit deployment template for smart apartment devices — smart locks, thermostats, leak detectors, and smart lighting. Covers unit survey, hub/network readiness, device installation waves, platform enrollment, and property-staff training.',
  technology: 'Smart Apartment IoT',
  isSystem: true,
  phases: [
    {
      name: 'Phase 1 — Kickoff & Unit Survey',
      order: 0,
      tasks: [
        {
          name: 'Kickoff with property management',
          description:
            'Review the device scope per unit type (locks, thermostats, leak detectors, lighting), the resident-notification plan, and unit-access procedures for occupied apartments. Confirm the smart-apartment platform (property management integration, resident app) and who administers it. Agree the installation wave schedule — floors or buildings per day — and the escalation path for no-access units.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Model-unit survey & device fit check',
          description:
            'Survey one unit of each floor plan: door prep and backset for the smart lock (verify deadbolt type and door thickness), HVAC compatibility for the thermostat (C-wire present or adapter needed), water-heater/washer locations for leak detectors, and switch boxes for smart lighting (neutral wire present?). Document Wi-Fi/Thread/Z-Wave signal at each device location and identify units needing repeaters. Photograph everything.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Network & hub readiness check',
          description:
            'Confirm the connectivity path for every device class: property Wi-Fi coverage inside units, hub-per-unit vs. floor-gateway topology, and VLAN/SSID for IoT traffic. Verify DHCP scope sizing for the full device count. Coordinate with the Managed Wi-Fi scope if being deployed in the same project.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Design sign-off & wave schedule',
          description:
            'Present the per-unit device list, platform architecture, and installation wave schedule to the customer. Confirm which device classes the electrician installs (typically hardwired smart lighting) versus FSG technicians. Obtain written sign-off before ordering.',
          duration_days: 0.5,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 2 — Procurement & Staging',
      order: 1,
      tasks: [
        {
          name: 'Submit purchase order',
          description:
            'Place the PO for all devices — smart locks, thermostats (plus C-wire adapters where flagged), leak detectors, smart switches/bulbs — hubs or gateways, repeaters for weak-signal units, batteries, and platform licenses. Verify counts against the unit matrix from the survey.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Receive, inventory & pre-provision devices',
          description:
            'Check in all hardware against the PO. Pre-provision at the staging area: enroll device serials into the platform, pre-pair to hubs where the platform supports it, load initial firmware updates, and label each device kit by unit number. Kitting per unit (lock + thermostat + detectors + switches in one bag) makes install waves dramatically faster.',
          duration_days: 1,
          role: 'Field Tech',
          order: 1,
        },
      ],
    },
    {
      name: 'Phase 3 — Installation Waves',
      order: 2,
      tasks: [
        {
          name: 'Install smart locks',
          description:
            'Swap deadbolts unit by unit per the wave schedule: remove existing deadbolt, install the smart lock per the door prep notes, verify smooth manual throw, pair to the hub/platform, and confirm remote lock/unlock. Return keyed cylinders and old hardware to property management with a per-unit log.',
          duration_days: 3,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Install smart thermostats',
          description:
            'Replace thermostats per unit: photograph existing wiring, install the C-wire adapter where flagged, mount and wire the new thermostat, and verify heat and cool both respond. Pair to the platform and apply the property\'s default schedule/setpoint profile.',
          duration_days: 2,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Place leak detectors',
          description:
            'Install leak detectors at each surveyed location — under kitchen sinks, at water heaters, behind washers, near HVAC drain pans. Verify each reports to the platform and test with a wet-contact simulation. Record placement per unit.',
          duration_days: 1,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Smart lighting — coordinate electrician & verify',
          description:
            'For hardwired smart switches, coordinate the licensed electrician\'s installation wave. After each wave, FSG pairs the installed switches to the platform, names them by room, and verifies control from the resident app profile. (Skip if lighting is out of scope or resident-supplied bulbs only.)',
          duration_days: 1,
          role: 'Tech Lead',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 4 — Platform Configuration & QA',
      order: 3,
      tasks: [
        {
          name: 'Unit-by-unit platform enrollment audit',
          description:
            'Audit every unit in the platform: all installed devices online, assigned to the correct unit, named consistently, and reporting battery state. Chase and resolve every offline device — a device that never onboarded is invisible to residents and staff alike.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Configure alerts, automations & access policies',
          description:
            'Configure platform behavior: leak alerts to property staff (24/7), low-battery notifications, vacant-unit setback schedules for thermostats, and staff master-access policies for locks (with audit trail). Verify resident-versus-staff permission boundaries on a test unit.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'End-to-end scenario testing & punch list',
          description:
            'Run full scenarios on sample units per floor: resident lock/unlock from the app, thermostat schedule override and revert, leak detector alarm to staff notification, light control. Compile the punch list of failed devices or misassignments, remediate, and re-test to closure.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 5 — Handoff & Closeout',
      order: 4,
      tasks: [
        {
          name: 'Property-staff training',
          description:
            'Train property staff hands-on: enrolling a new resident and revoking access at move-out, responding to leak and low-battery alerts, granting temporary vendor access, and the battery-replacement routine per device class. Confirm staff can independently run a move-in/move-out cycle before closing training.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Deliver as-built documentation',
          description:
            'Deliver the handoff package: per-unit device matrix with serials, hub/gateway topology and IP table, platform admin credentials (stored securely), battery schedule by device class, warranty terms, and the FSG support escalation path.',
          duration_days: 0.5,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Project closeout',
          description:
            'Issue the final invoice, close open time entries, and mark the project complete in FSG OS. Update the CRM account with device counts and platform details. Schedule a 30-day check-in to review alert volume, offline devices, and staff comfort with the system.',
          duration_days: 0.5,
          role: 'PM',
          order: 2,
        },
      ],
    },
  ],
};
