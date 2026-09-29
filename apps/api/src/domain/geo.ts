// The fixed list of Dhaka zones every ride starts and ends in, and the road distances between them
// (docs/domain.md §2). Coordinates are rough zone centres for display only; fares and matching use
// the distance table.
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

export const ZONE_CODES = ZONES.map((zone) => zone.code) as [ZoneCode, ...ZoneCode[]];

// Road distance in whole km. Row and column order = the ZONES order above.
// prettier-ignore
const ROAD_KM: readonly (readonly number[])[] = [
  //  UTT  BAS  MIR  BAN  GU2  GU1  MOH  TEJ  FAR  DHA
  [    0,  14,  11,  13,  14,  16,  16,  18,  18,  20 ], // UTTARA
  [   14,   0,  12,   8,   7,   8,  10,  12,  13,  16 ], // BASHUNDHARA
  [   11,  12,   0,   6,   7,   8,   6,   8,   8,   9 ], // MIRPUR
  [   13,   8,   6,   0,   2,   4,   3,   5,   6,   9 ], // BANANI
  [   14,   7,   7,   2,   0,   2,   3,   5,   7,   9 ], // GULSHAN_2
  [   16,   8,   8,   4,   2,   0,   2,   4,   5,   8 ], // GULSHAN_1
  [   16,  10,   6,   3,   3,   2,   0,   2,   4,   6 ], // MOHAKHALI
  [   18,  12,   8,   5,   5,   4,   2,   0,   2,   5 ], // TEJGAON
  [   18,  13,   8,   6,   7,   5,   4,   2,   0,   3 ], // FARMGATE
  [   20,  16,   9,   9,   9,   8,   6,   5,   3,   0 ], // DHANMONDI
];

/** Road distance between two zones in whole km (0 for the same zone). */
export function distanceKm(from: ZoneCode, to: ZoneCode): number {
  const km = ROAD_KM[ZONE_CODES.indexOf(from)]?.[ZONE_CODES.indexOf(to)];
  if (km === undefined) throw new Error(`no distance between ${from} and ${to}`);
  return km;
}
