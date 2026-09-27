// The fixed list of Dhaka zones every ride starts and ends in (see docs/domain.md).
// Coordinates are rough zone centres, kept for display only: fares and matching use the
// road-distance table added in Phase 6.
export const ZONES = [
  { code: 'UTTARA', name: 'Uttara', lat: 23.8759, lng: 90.3795 },
  { code: 'BASHUNDHARA', name: 'Bashundhara R/A', lat: 23.8193, lng: 90.4526 },
  { code: 'MIRPUR', name: 'Mirpur', lat: 23.8069, lng: 90.3686 },
  { code: 'BANANI', name: 'Banani', lat: 23.7937, lng: 90.4066 },
  { code: 'GULSHAN_2', name: 'Gulshan 2', lat: 23.7947, lng: 90.4144 },
  { code: 'GULSHAN_1', name: 'Gulshan 1', lat: 23.7808, lng: 90.4168 },
  { code: 'MOHAKHALI', name: 'Mohakhali', lat: 23.778, lng: 90.4005 },
  { code: 'TEJGAON', name: 'Tejgaon', lat: 23.764, lng: 90.399 },
  { code: 'FARMGATE', name: 'Farmgate', lat: 23.7577, lng: 90.3896 },
  { code: 'DHANMONDI', name: 'Dhanmondi', lat: 23.7461, lng: 90.3742 },
] as const;

export type ZoneCode = (typeof ZONES)[number]['code'];
