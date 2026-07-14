export const EV_CHARGING = {
  id: 'system:ev-charging',
  name: 'EV Charging Station Deployment',
  description:
    'Deployment template for EV charging infrastructure — site electrical assessment, utility and permitting coordination, make-ready construction, charger installation and commissioning, and network activation.',
  technology: 'EV Charging',
  isSystem: true,
  phases: [
    {
      name: 'Phase 1 — Site Assessment & Design',
      order: 0,
      tasks: [
        {
          name: 'Kickoff & requirements review',
          description:
            'Review the charging scope with the customer: number of ports now and planned (future-proofing), Level 2 vs. DC fast charging mix, resident/visitor/fleet usage model, billing expectations (free, flat, metered kWh), and the network platform. Identify the utility account holder and who will own ongoing network fees.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Electrical capacity assessment',
          description:
            'Assess the electrical service: main switchgear capacity and spare breaker positions, panel schedules, transformer capacity, and available amperage for the charging load. Determine whether load management (dynamic sharing) avoids a service upgrade. Document the conduit route from the source panel to each charging location, including trenching or boring runs across parking areas.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Utility & incentive coordination',
          description:
            'Engage the utility early: service-upgrade application if required, EV-specific rate tariffs, and make-ready incentive programs (many utilities fund conduit/panel work). File incentive paperwork — approval timelines often gate the whole schedule. Document utility requirements for metering (separate EV meter vs. house meter).',
          duration_days: 1,
          role: 'PM',
          order: 2,
        },
        {
          name: 'Design, permits & sign-off',
          description:
            'Produce the electrical design: one-line diagram, panel/breaker schedule, conduit and wire sizing per NEC 625, charger mounting details (pedestal vs. wall), ADA-accessible space compliance, and signage/striping plan. Submit for electrical permit. Present design and total cost (including make-ready) to the customer for written sign-off.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 2 — Procurement',
      order: 1,
      tasks: [
        {
          name: 'Order chargers & electrical materials',
          description:
            'Place the PO: charging stations, mounting pedestals or wall brackets, cable management, load-management hardware if designed, panels/breakers, conduit, conductor, bollards for drive-aisle protection, and signage. Confirm charger lead times — supply can be weeks out — and network subscription activation codes.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Receive & stage equipment',
          description:
            'Check in all equipment against the PO. Inspect chargers for shipping damage, record serial numbers, and register units with the manufacturer for warranty. Stage electrical materials at the site and confirm the electrician\'s mobilization date against permit approval.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 1,
        },
      ],
    },
    {
      name: 'Phase 3 — Make-Ready Construction',
      order: 2,
      tasks: [
        {
          name: 'Panel & feeder installation',
          description:
            'Install the dedicated EV panel or subpanel and feeder from the source switchgear per the approved design. Land breakers per the schedule. If a utility service upgrade is in scope, coordinate the utility cutover window with property management (building power interruption notice).',
          duration_days: 1,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Conduit runs, trenching & wire pull',
          description:
            'Install conduit from the panel to each charger location — surface raceway in garages, trenching/boring with proper burial depth across open parking. Pull conductors sized per design, land at both ends, and megger-test each run. Restore trenched surfaces (patch/compaction) to pre-work condition.',
          duration_days: 2,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Rough-in inspection',
          description:
            'Schedule and pass the electrical rough-in inspection with the AHJ before energizing. Resolve any corrections immediately — inspection re-visits are a common schedule slip.',
          duration_days: 0.5,
          role: 'PM',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 4 — Charger Install & Commissioning',
      order: 3,
      tasks: [
        {
          name: 'Mount & wire charging stations',
          description:
            'Set pedestals or wall mounts at each location, mount the chargers, terminate conductors, and install bollards and cable management. Verify torque specs on all terminations. Apply unit labels/station IDs per the network plan.',
          duration_days: 1,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Energize & commission each port',
          description:
            'Energize and commission port by port: verify voltage at the charger, connect the unit to the network (cellular or property LAN/Wi-Fi per design), apply firmware updates, configure load-management groups, and run a live charge test on an EV or test load. Record commissioning results per port.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Network platform configuration',
          description:
            'Configure the charging network: station names and location pins, access control (open, RFID, app-based, resident-only), pricing policy and payout account, idle-fee rules, and alert recipients for faulted stations. Verify each station reports sessions and energy correctly to the dashboard.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Final inspection & signage',
          description:
            'Pass the final electrical inspection. Install EV-parking signage and stall striping per the plan, including ADA-designated spaces. Photograph the finished installation for the closeout package.',
          duration_days: 0.5,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 5 — Handoff & Closeout',
      order: 4,
      tasks: [
        {
          name: 'Customer training & go-live',
          description:
            'Train the property team on the network dashboard: monitoring sessions, restarting a faulted station, adjusting pricing, and running usage/revenue reports. Walk through the driver experience end to end (locate, start, pay). Announce go-live to residents/tenants with the customer.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Deliver as-built documentation',
          description:
            'Deliver the closeout package: as-built one-line and conduit routing, panel schedules, charger serials and warranty registrations, network admin credentials (stored securely), permit and inspection records, incentive documentation, and the FSG support escalation path.',
          duration_days: 0.5,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Project closeout',
          description:
            'Issue the final invoice, close time entries, and mark the project complete in FSG OS. Update the CRM account with port counts, charger models, and network platform. Schedule a 30-day utilization review — uptime, session volume, and any fault patterns.',
          duration_days: 0.5,
          role: 'PM',
          order: 2,
        },
      ],
    },
  ],
};
