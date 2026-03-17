/**
 * CWMS Mapping for Ohio River Locks
 *
 * Source-of-truth for lock-to-CWMS mappings to avoid display-name guessing.
 * Each entry maps a lock ID to verified CWMS timeseries identifiers.
 *
 * Fields:
 * - lockId: Numeric lock identifier
 * - uiName: Display name used in UI
 * - cwmsBaseId: CWMS location identifier (verified)
 * - office: CWMS office code (verified)
 * - aliases: Alternative names for matching
 * - verified: Whether mapping has been manually verified
 */

export const LOCK_CWMS_MAP = {
  17: {
    lockId: 17,
    uiName: "J.T. Myers L&D",
    cwmsBaseId: "JTMI",
    office: "LRL",
    aliases: ["J.T. Myers", "JT Myers"],
    verified: false,
    status: "unverified",
    notes: "placeholder/discovery candidate only; not proven CWMS ID; keep verified false"
  },
  16: {
    lockId: 16,
    uiName: "Newburgh L&D",
    cwmsBaseId: "NEWB",
    office: "LRL",
    aliases: ["Newburgh"],
    verified: false,
    status: "unverified",
    notes: "placeholder/discovery candidate only; not proven CWMS ID; keep verified false"
  },
  // Placeholder mappings - require manual verification
  15: {
    lockId: 15,
    uiName: "Cannelton L&D",
    cwmsBaseId: "CANN", // UNVERIFIED - needs manual check
    office: "LRL", // UNVERIFIED
    aliases: ["Cannelton"],
    verified: false
  },
  14: {
    lockId: 14,
    uiName: "McAlpine L&D",
    cwmsBaseId: "MCAL", // UNVERIFIED
    office: "LRL", // UNVERIFIED
    aliases: ["McAlpine"],
    verified: false
  },
  13: {
    lockId: 13,
    uiName: "John T. Myers L&D",
    cwmsBaseId: "JTMI", // Same as 17?
    office: "LRL",
    aliases: ["John T. Myers"],
    verified: false
  },
  12: {
    lockId: 12,
    uiName: "Smithland L&D",
    cwmsBaseId: "SMIT", // UNVERIFIED
    office: "LRL", // UNVERIFIED
    aliases: ["Smithland"],
    verified: false
  },
  11: {
    lockId: 11,
    uiName: "Olmsted L&D",
    cwmsBaseId: "OLMS", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Olmsted"],
    verified: false
  },
  10: {
    lockId: 10,
    uiName: "Greenup L&D",
    cwmsBaseId: "GREE", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Greenup"],
    verified: false
  },
  9: {
    lockId: 9,
    uiName: "Maysville L&D",
    cwmsBaseId: "MAYS", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Maysville"],
    verified: false
  },
  8: {
    lockId: 8,
    uiName: "Gallipolis L&D",
    cwmsBaseId: "GALL", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Gallipolis"],
    verified: false
  },
  7: {
    lockId: 7,
    uiName: "Hannibal L&D",
    cwmsBaseId: "HANN", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Hannibal"],
    verified: false
  },
  6: {
    lockId: 6,
    uiName: "Racine L&D",
    cwmsBaseId: "RACI", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Racine"],
    verified: false
  },
  5: {
    lockId: 5,
    uiName: "R.C. Byrd L&D",
    cwmsBaseId: "RCBY", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["R.C. Byrd", "RC Byrd"],
    verified: false
  },
  4: {
    lockId: 4,
    uiName: "Huntington L&D",
    cwmsBaseId: "HUNT", // UNVERIFIED
    office: "LRH", // UNVERIFIED
    aliases: ["Huntington"],
    verified: false
  },
  3: {
    lockId: 3,
    uiName: "Winfield L&D",
    cwmsBaseId: "WINF", // UNVERIFIED
    office: "LRP", // UNVERIFIED
    aliases: ["Winfield"],
    verified: false
  },
  2: {
    lockId: 2,
    uiName: "Haysville L&D",
    cwmsBaseId: "HAYS", // UNVERIFIED
    office: "LRP", // UNVERIFIED
    aliases: ["Haysville"],
    verified: false
  },
  1: {
    lockId: 1,
    uiName: "Emsworth L&D",
    cwmsBaseId: "EMSW", // UNVERIFIED
    office: "LRP", // UNVERIFIED
    aliases: ["Emsworth"],
    verified: false
  }
};

/**
 * Normalize a lock name for matching
 */
export function normalizeLockName(lockName) {
  return lockName.toLowerCase().trim();
}

/**
 * Get mapping for a lock by ID or name
 */
export function getMappedLockSource(lockId, lockName) {
  // First try by lockId
  if (LOCK_CWMS_MAP[lockId]) {
    return LOCK_CWMS_MAP[lockId];
  }

  // Fallback to name matching
  const normalized = normalizeLockName(lockName);
  for (const mapping of Object.values(LOCK_CWMS_MAP)) {
    if (normalizeLockName(mapping.uiName) === normalized) {
      return mapping;
    }
    for (const alias of mapping.aliases) {
      if (normalizeLockName(alias) === normalized) {
        return mapping;
      }
    }
  }

  return null;
}

/**
 * Build timeseries candidates for a mapped lock
 */
export function buildMappedTimeseriesCandidates(mapping) {
  const baseId = mapping.cwmsBaseId;
  return [
    `${baseId}.Flow.Inst.1Hour.0`,
    `${baseId}.Stage.Inst.1Hour.0`,
    `${baseId}.Elev.Inst.1Hour.0`,
    `${baseId}.Flow.Inst.1Hour.0.lrldloc-rev`,
    `${baseId}.Stage.Inst.1Hour.0.lrldloc-rev`,
    `${baseId}.Elev.Inst.1Hour.0.lrldloc-rev`
  ];
}