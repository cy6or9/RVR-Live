/**
 * Lock Status Discovery API
 *
 * Manual utility for discovering CWMS base IDs for Ohio River locks.
 * This endpoint is for debugging only and should not be used by the frontend.
 *
 * Generates candidate base IDs from lock names and tests them against CWMS.
 * Returns structured results to help identify correct mappings.
 */

const FETCH_TIMEOUT_MS = 8000;

/**
 * Normalize lock name for discovery
 */
function normalizeLockNameForDiscovery(lockName) {
  return lockName
    .replace(/\s*L\s*&\s*D\s*$/i, '') // Remove "L&D" suffix
    .replace(/\s*Lock\s+and\s+Dam\s*$/i, '') // Remove "Lock and Dam"
    .trim();
}

/**
 * Generate candidate base IDs from lock name
 */
function generateDiscoveryBaseIds(lockName) {
  const normalized = normalizeLockNameForDiscovery(lockName);
  const key = normalized.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  // Manual prioritized candidates for known locks
  const manual = {
    'jt myers': ['JTMYERS', 'JTMI', 'MYERS'],
    'newburgh': ['NEWBURGH', 'NEWB', 'NEWBURG']
  };

  const candidates = new Set();

  if (manual[key]) {
    manual[key].forEach((id) => candidates.add(id));
    return Array.from(candidates).slice(0, 12);
  }

  // Build base id from normalized name (remove all non-alphanumerics)
  const compact = normalized.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length >= 4) candidates.add(compact);

  // Add last word if meaningful
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const last = words[words.length - 1].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (last.length >= 4) candidates.add(last);

    const first = words[0].toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (first.length >= 4) candidates.add(first);
  }

  // Add short abbreviation if it seems meaningful
  if (compact.length >= 5) {
    const short = compact.slice(0, 5);
    if (short.length >= 4) candidates.add(short);
  }

  // Ensure we never emit junk tokens
  const filtered = Array.from(candidates).filter((id) => {
    if (!id) return false;
    if (id.length < 4) return false;
    const junk = ['J.T.', 'L&D', 'LOCK', 'DAM'];
    if (junk.includes(id)) return false;
    return true;
  });

  return filtered.slice(0, 12);
}

/**
 * Try to discover base IDs from CWMS catalog endpoints
 */
async function discoverFromCatalog(fragments, offices) {
  const catalogCandidates = new Set();
  const catalogAttempts = [];

  // Try locations endpoint for each office
  for (const office of offices) {
    const url = `https://cwms-data.usace.army.mil/cwms-data/locations?office=${office}`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "RiverValleyReport-Discovery/1.0" },
        signal: ctrl.signal,
      });
      clearTimeout(timeoutId);
      catalogAttempts.push({ url, status: response.status, contentType: response.headers.get('content-type') });

      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        if (Array.isArray(data)) {
          for (const loc of data) {
            const name = loc.name || loc.id || '';
            for (const frag of fragments) {
              if (name.toUpperCase().includes(frag.toUpperCase())) {
                catalogCandidates.add(name.toUpperCase());
              }
            }
          }
        }
      }
    } catch (error) {
      catalogAttempts.push({ url, status: null, error: error.message });
    }

    if (catalogAttempts.length >= 10) break; // Max 10 catalog attempts
  }

  return { catalogCandidates: Array.from(catalogCandidates), catalogAttempts };
}
async function testDiscoveryCandidate(baseId, metric, office) {
  const url = `https://cwms-data.usace.army.mil/cwms-data/timeseries?name=${encodeURIComponent(baseId)}.${metric}.Inst.1Hour.0&office=${office}`;

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "RiverValleyReport-Discovery/1.0"
      },
      signal: ctrl.signal,
    });
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    let parseable = false;
    let shortPreview = null;

    if (response.ok) {
      if (contentType.includes('application/json')) {
        const data = await response.json();
        parseable = data && typeof data === 'object' && Array.isArray(data.values);
        shortPreview = parseable ? `values[${data.values?.length || 0}]` : 'unexpected_json';
      } else {
        const text = await response.text();
        shortPreview = text.substring(0, 120);
        parseable = text.includes('values') || text.includes('name');
      }
    }

    return {
      office,
      baseId,
      metric,
      url,
      status: response.status,
      contentType,
      parseable: response.status === 404 ? false : parseable,
      shortPreview: response.status === 404 ? '404' : (shortPreview || null)
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      office,
      baseId,
      metric,
      url,
      status: null,
      contentType: null,
      parseable: false,
      shortPreview: `error: ${error.message}`
    };
  }
}

/**
 * Main discovery handler
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { lockId, lockName, q } = req.query;

  if (!lockId || !lockName) {
    return res.status(400).json({
      error: "lockId and lockName required",
      usage: "/api/lock-status-discover?lockId=17&lockName=J.T.%20Myers%20L%26D"
    });
  }

  const lockIdNum = parseInt(lockId);
  if (!Number.isFinite(lockIdNum) || lockIdNum < 1) {
    return res.status(400).json({ error: "Invalid lockId" });
  }

  try {
    const baseIds = generateDiscoveryBaseIds(lockName);
    const metrics = ['Flow', 'Stage', 'Elev'];
    const offices = ['LRL', 'LRN', 'LRP'];

    const candidatesTried = [];
    const hits = [];
    const misses = [];
    let status200 = 0;
    let status404 = 0;
    let otherStatuses = 0;
    let directAttempts = 0;
    let catalogAttempts = 0;
    let catalogHits = 0;
    let discoveryModeUsed = 'direct_only';

    // Stage A: Direct timeseries candidates
    let attempts = 0;
    const maxDirectAttempts = 36;

    outer: for (const baseId of baseIds) {
      for (const metric of metrics) {
        for (const office of offices) {
          if (attempts >= maxDirectAttempts) break outer;

          const result = await testDiscoveryCandidate(baseId, metric, office);
          attempts++;
          directAttempts++;
          candidatesTried.push({ ...result, sourceType: 'direct_timeseries' });

          if (result.status === 200) {
            status200++;
            if (result.parseable) {
              hits.push({ ...result, sourceType: 'direct_timeseries' });
            } else {
              misses.push(result);
            }
          } else if (result.status === 404) {
            status404++;
            misses.push(result);
          } else {
            otherStatuses++;
            misses.push(result);
          }
        }
      }
    }

    // Stage B: Catalog discovery if no hits
    let catalogCandidates = [];
    let catalogAttemptDetails = [];
    if (hits.length === 0) {
      discoveryModeUsed = 'catalog_search';
      const fragments = baseIds; // Use baseIds as fragments
      const catalogResult = await discoverFromCatalog(fragments, offices);
      catalogCandidates = catalogResult.catalogCandidates;
      catalogAttemptDetails = catalogResult.catalogAttempts;
      catalogAttempts = catalogAttemptDetails.length;

      // Test catalog-found candidates (but cap total attempts)
      for (const baseId of catalogCandidates) {
        for (const metric of metrics) {
          for (const office of offices) {
            if (attempts >= 36) break; // Hard cap

            const result = await testDiscoveryCandidate(baseId, metric, office);
            attempts++;
            candidatesTried.push({ ...result, sourceType: 'catalog_match' });

            if (result.status === 200) {
              status200++;
              catalogHits++;
              if (result.parseable) {
                hits.push({ ...result, sourceType: 'catalog_match' });
              } else {
                misses.push(result);
              }
            } else if (result.status === 404) {
              status404++;
              misses.push(result);
            } else {
              otherStatuses++;
              misses.push(result);
            }
          }
        }
      }
    }

    const bestHit = hits.length ? hits[0] : null;
    const baseIdsUnique = Array.from(new Set(baseIds));

    const response = {
      lockId: lockIdNum,
      lockName,
      baseIdsGenerated: baseIdsUnique,
      candidatesTried,
      hits,
      misses,
      summary: {
        discoveryModeUsed,
        directAttempts,
        catalogAttempts,
        catalogHits,
        candidateFragmentsTried: baseIdsUnique,
        status200,
        status404,
        otherStatuses,
        bestHit: bestHit ? { baseId: bestHit.baseId, office: bestHit.office, metric: bestHit.metric, sourceType: bestHit.sourceType } : null,
        note: hits.length === 0 ? "Direct timeseries guessing failed; no public searchable CWMS catalog endpoint confirmed" : null
      }
    };

    console.log(
      `[lock-status-discover] ${lockName} directAttempts=${directAttempts} catalogAttempts=${catalogAttempts} hits=${hits.length} 404=${status404}`
    );

    res.status(200).json(response);
  } catch (error) {
    console.error("[lock-status-discover] Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
}