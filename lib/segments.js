// High-level BOM segments — group the fine-grained product categories into the
// five buckets shown/filtered in the BOM table.

export const SEGMENT_ORDER = [
  'WiFi HW',
  'Cameras HW',
  'Software',
  'Accessories',
  'Infrastructure',
];

const CATEGORY_TO_SEGMENT = {
  // WiFi HW — the wireless network hardware
  Gateway: 'WiFi HW',
  'Access Point': 'WiFi HW',
  Switch: 'WiFi HW',
  'Aggregate Switch': 'WiFi HW',
  // Cameras HW — surveillance hardware
  Camera: 'Cameras HW',
  NVR: 'Cameras HW',
  Storage: 'Cameras HW',
  // Software — subscriptions / licensing
  Subscription: 'Software',
  Software: 'Software',
  // Accessories — small add-on parts
  Mounting: 'Accessories',
  'Fiber Module': 'Accessories',
  Cable: 'Accessories',
  Miscellaneous: 'Accessories',
  // Infrastructure — physical plant / power / cabling
  UPS: 'Infrastructure',
  Rack: 'Infrastructure',
  'Rack Accessory': 'Infrastructure',
  Fiber: 'Infrastructure',
  Enclosure: 'Infrastructure',
  Cabling: 'Infrastructure',
};

export function segmentOf(category) {
  return CATEGORY_TO_SEGMENT[category] || 'Accessories';
}
