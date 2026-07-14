export const FIBER = {
  id: 'system:fiber',
  name: 'Fiber Optic Deployment',
  description:
    'End-to-end deployment template for fiber optic infrastructure — outside plant OSP runs, building backbone, and ISP last-mile. Covers engineering, permitting, installation, OTDR testing, and handoff.',
  technology: 'Digital Infrastructure',
  isSystem: true,
  phases: [
    {
      name: 'Phase 1 — Kickoff & Engineering',
      order: 0,
      tasks: [
        {
          name: 'Kickoff meeting with customer & stakeholders',
          description:
            'Conduct project kickoff with the customer, property owner, and any relevant ISP or municipal contacts. Review the full scope: route, fiber count, conduit requirements, splice points, and termination types. Establish key contacts, communication protocols, and escalation path. Confirm schedule and site access requirements. Document any existing fiber plant that will be reused or decommissioned.',
          duration_days: 0.5,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Route survey & field engineering',
          description:
            'Walk the full proposed fiber route and photograph every segment. Document distances between all splice points, hand holes, pull boxes, and termination locations. Record existing conduit availability, conduit fill percentages, and obstructions. For OSP routes, note pavement type (asphalt, concrete, gravel), crossing types (road, driveway, sidewalk), overhead vs. underground preference, and any wetlands or environmentally sensitive areas. Confirm ISP demarcation point location. Calculate fiber strand count requirements — add 25% spare strands minimum.',
          duration_days: 2,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Fiber design & strand assignment',
          description:
            'Produce a fiber design document: route map with distances, conduit schedule, hand hole/pull box locations, splice enclosure locations, fiber count (typically 12, 24, 48, or 96-strand), fiber type (OS2 single-mode for distances >100m or long-haul; OM4 multi-mode for intra-building), and connector types (LC, SC, or MPO per termination equipment). Create a fiber strand assignment chart showing which strands serve which end points. Specify OTDR test window (wavelength and acceptable dB loss budget).',
          duration_days: 1,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Design review & customer sign-off',
          description:
            'Present the fiber design, route map, and strand assignment plan to the customer. Review splice count, termination locations, estimated loss budget, and any route deviations from the original plan. Discuss restoration/repair strategy for future breaks. Obtain written approval before purchasing materials or beginning permitting.',
          duration_days: 0.5,
          role: 'PM',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 2 — Permitting & Locates',
      order: 1,
      tasks: [
        {
          name: 'Call 811 / utility locates',
          description:
            'Submit all 811 (Call Before You Dig) locate requests for the full route at least 3 business days before any excavation. Mark the dig area with white paint or flags per 811 protocol. Photograph all utility markings before excavation begins. Verify all utilities are marked: gas, electric, telecom, water, sewer, and fiber. Do not begin any underground work until all utilities are marked and the waiting period is complete.',
          duration_days: 1,
          role: 'PM',
          order: 0,
        },
        {
          name: 'Obtain permits & right-of-way approvals',
          description:
            'Identify all required permits: municipal right-of-way (ROW) permits for work in public streets or sidewalks, bore/trench permits, traffic control plans if lane closures are needed, and any HOA or property owner easement agreements. Submit permit applications with required site plans and insurance certificates. Track permit status and schedule work around permit approval dates. File copies of all issued permits with the project record.',
          duration_days: 3,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Traffic control & safety plan',
          description:
            'For any work in or adjacent to public roadways, develop a traffic control plan (TCP) per MUTCD standards. Arrange for flaggers, cones, and signage. Notify the local traffic engineering department if signal timing changes are required. Brief the crew on the TCP before work begins. Ensure all crew members have required PPE and hi-vis vests at all times in the ROW.',
          duration_days: 0.5,
          role: 'PM',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 3 — Conduit & Pathway Installation',
      order: 2,
      tasks: [
        {
          name: 'Hand hole & pull box installation',
          description:
            'Excavate and set hand holes or pull boxes at all designed locations (typically every 300–500 feet on buried routes, at all directional changes >30°, and at building entries). Set boxes to grade per local codes. Install conduit knockouts for all incoming/outgoing runs. Install a pull bail and grade ring if applicable. Backfill and tamp around the box. Install a warning tape 12" above all buried conduit.',
          duration_days: 2,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Directional boring or trenching',
          description:
            'Complete all underground conduit installation using the approved method: horizontal directional drilling (HDD) for road crossings and areas where open cut is not permitted, or open-cut trenching per permit conditions. Install conduit at the designed depth (minimum 24" in pedestrian areas, 36" under roads per local code). Glue all conduit joints. Install pull string in all empty conduit. Backfill, compact, and restore all surfaces to original condition.',
          duration_days: 3,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Aerial strand & lashing (if aerial route)',
          description:
            'For aerial routes: install strand (messenger wire) between poles at correct sag per span length and NESC tension requirements. Bond strand to all poles with approved bonding hardware. Install down guys or push braces at corner and deadend poles as required. After strand inspection, proceed with cable lashing in Phase 4.',
          duration_days: 2,
          role: 'Field Tech',
          order: 2,
        },
        {
          name: 'Building entry & riser conduit',
          description:
            'Install conduit from the building entry point (handhole or pole) to the termination room (MDF/IDF or telecom room). Use rigid steel conduit through the building foundation entry (fire-stop all penetrations per code). Install innerduct inside building conduit to protect the fiber cable. Pull a pull string. Label all conduit at both ends and at each floor penetration.',
          duration_days: 1,
          role: 'Field Tech',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 4 — Cable Placement',
      order: 3,
      tasks: [
        {
          name: 'Pull fiber cable — underground segments',
          description:
            'Lubricate conduit with approved cable lube and pull the fiber cable through each underground segment using a cable blower or manual pull rope. Do not exceed the cable\'s minimum bend radius (typically 20× cable diameter) or maximum pull tension (typically 600 lbf for ADSS, 100 lbf for loose-tube OSP). Leave 10–15 feet of slack at each hand hole and 30 feet at each splice location. Secure cable to hand hole bail.',
          duration_days: 2,
          role: 'Field Tech',
          order: 0,
        },
        {
          name: 'Lash fiber to strand — aerial segments',
          description:
            'Lash the fiber cable to the aerial messenger strand using a lashing machine. Maintain correct lashing wire pitch. Install cable support brackets (J-hooks or loops) at each pole. Leave 30 feet of figure-8 slack coil at each splice location and 10 feet at each building entry. Protect the cable from weather at all termination points using weatherproof entry fittings.',
          duration_days: 1,
          role: 'Field Tech',
          order: 1,
        },
        {
          name: 'Route cable inside buildings',
          description:
            'Route the fiber cable from the building entry through the riser conduit to the termination room. Use innerduct or split loom to protect the cable in exposed areas. Do not exceed minimum bend radius at any turn. Secure cable with fiber-rated J-hooks or Velcro straps every 48" in the telecom room and every 10 feet in the riser. Leave a 10-foot service loop in the termination room.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 5 — Splicing & Termination',
      order: 4,
      tasks: [
        {
          name: 'Fusion splicing at all splice points',
          description:
            'At each splice enclosure or splice tray, prepare the cable ends: strip the outer jacket, remove the armor (if armored cable), and separate the buffer tubes. Clean and cleave each fiber. Fusion splice using a calibrated splicer (target average splice loss <0.05 dB). Place each splice in a splice protection sleeve and heat-shrink. Organize splices into the splice tray in tube order. Document splice loss readings for each fiber. Seal the splice enclosure per manufacturer instructions.',
          duration_days: 2,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Fiber termination at patch panels',
          description:
            'At each endpoint (ODF, patch panel, or splice closure in the telecom room), terminate the fiber cable with the appropriate connector type (LC/UPC or LC/APC per design, or SC if legacy equipment requires it) using either fusion splice-on connectors or pre-polished mechanical connectors. Insert connectors into the patch panel adapter plate in the designed strand order. Label each port with the strand number and destination.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Slack storage & final cable management',
          description:
            'Coil and store all excess cable slack at splice enclosures and termination points in approved slack storage spools or loops sized ≥12" diameter. Secure all cables with Velcro straps (never zip ties on fiber). Apply labels to both ends of all patch cords. Verify all splice enclosures are sealed and mounted securely. Photograph all completed termination points for as-built documentation.',
          duration_days: 0.5,
          role: 'Field Tech',
          order: 2,
        },
      ],
    },
    {
      name: 'Phase 6 — Testing & Certification',
      order: 5,
      tasks: [
        {
          name: 'OTDR testing — all strands, both directions',
          description:
            'Test every fiber strand from both ends using a calibrated OTDR at the appropriate wavelength (1310/1550 nm for OS2 single-mode; 850/1300 nm for OM4 multi-mode). Use a launch cable (minimum 50m) to eliminate the dead zone at the near end. Record all events (splices, connectors, bends), total loss, and ORL. Compare total loss against the designed loss budget. Flag any strand that exceeds the budget or shows a reflective event greater than 0.05 dB above the baseline.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Insertion loss testing (end-to-end)',
          description:
            'Perform end-to-end insertion loss testing on all strands using a calibrated light source and power meter. Record results in dB and compare against the TIA-568 insertion loss limit for the installed channel (single-mode link: ≤3.5 dB typical; multi-mode OM4: per TIA tables). Any strand exceeding the limit must be investigated and remediated before the project can be certified.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 1,
        },
        {
          name: 'Live link verification',
          description:
            'After termination and testing, insert SFP transceivers at both ends and verify each link lights up on the connected network equipment. Confirm auto-negotiated speed and duplex match the designed interface settings. Run a 15-minute iPerf3 throughput test on all active links and verify throughput matches the link capacity with no packet loss or errors.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 2,
        },
        {
          name: 'Punch list & remediation',
          description:
            'Compile all failing strands, poor splice results, or cabling deficiencies identified during testing. Re-splice or re-terminate as required until all strands pass the loss budget and link verification. Document the remediation action taken for each deficiency. Obtain all strands passing before scheduling customer handoff.',
          duration_days: 1,
          role: 'Tech Lead',
          order: 3,
        },
      ],
    },
    {
      name: 'Phase 7 — Network Integration & Handoff',
      order: 6,
      tasks: [
        {
          name: 'Connect to active network equipment',
          description:
            'Patch the fiber from the ODF to the active networking equipment (switches, routers, ONTs, or WDM gear) using pre-tested LC patch cords. Verify all links are active at the designed speed. Update switch port labels and the IP address plan with any new interfaces brought online. Confirm VLAN tagging, routing, or WDM channel assignments are correct.',
          duration_days: 0.5,
          role: 'Tech Lead',
          order: 0,
        },
        {
          name: 'Deliver as-built documentation & test reports',
          description:
            'Compile the full handoff package: (1) As-built route map with all distances, splice locations, hand holes, and conduit segments. (2) Fiber strand assignment chart (end-to-end). (3) OTDR trace files and printouts for all strands in both directions. (4) Insertion loss test results. (5) Splice loss log. (6) Equipment serial numbers and warranty information. (7) Contact information for FSG and any subcontractors involved. Deliver in both digital (PDF) and printed formats.',
          duration_days: 1,
          role: 'PM',
          order: 1,
        },
        {
          name: 'Project closeout',
          description:
            'Issue final invoice per contract. Close all open time entries and mark project complete in FSG OS. Update the CRM account record with route details, strand count, and support tier. File all permits with the project record. Start the warranty period clock. Schedule a 30-day check-in to confirm the fiber plant is performing within spec. Archive all test results, as-built drawings, and project documentation.',
          duration_days: 0.5,
          role: 'PM',
          order: 2,
        },
      ],
    },
  ],
};
