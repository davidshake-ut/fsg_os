import { MULTIFAMILY_WIFI } from './multifamilyWifi';
import { CAMERA_SYSTEMS } from './cameraSystems';
import { FIBER } from './fiber';
import { ACCESS_CONTROL } from './accessControl';
import { SMART_APARTMENT } from './smartApartment';
import { AUDIO_VISUAL } from './audioVisual';
import { EV_CHARGING } from './evCharging';
import { OTHER_TECHNOLOGY } from './other';

export const SYSTEM_TEMPLATES = [
  FIBER,
  MULTIFAMILY_WIFI,
  CAMERA_SYSTEMS,
  ACCESS_CONTROL,
  SMART_APARTMENT,
  AUDIO_VISUAL,
  EV_CHARGING,
  OTHER_TECHNOLOGY,
];

// Technology names match the Builder registry labels (lib/technologies.js,
// re-keyed in migration 0050) plus 'Other' for anything uncategorized.
export const TECHNOLOGIES = [
  'Digital Infrastructure',
  'Managed Wi-Fi',
  'Video Surveillance',
  'Access Control',
  'Smart Apartment IoT',
  'Audio/Video',
  'EV Charging',
  'Other',
];

export function systemTemplatesForTech(technology) {
  return SYSTEM_TEMPLATES.filter((t) => t.technology === technology);
}
