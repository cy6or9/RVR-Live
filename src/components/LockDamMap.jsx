import { ohioRiverLocks } from "@/lib/locks";
import { normalizeLockActivity } from "@/lib/lockActivity";
import { DANGER_LEVELS } from "@/lib/dangerScore";

/**
 * LockDamMap Component
 *
 * Renders river-danger assessment cards for each lock/dam.
 * Danger score combines river stage, flow, trend, wind, and weather.
 * No synthetic tow-traffic metrics are displayed.
 */

export default function LockDamMap({ locksData = null, lockActivityById = {} }) {
  const locks = Array.isArray(locksData) && locksData.length > 0 ? locksData : ohioRiverLocks;
  const lockData = locks.map((lock) => ({
    ...lock,
    activity: lockActivityById[lock.id] || normalizeLockActivity(lock, null),
  }));

  return (
    <div className="w-full bg-black/40 rounded border border-white/20 p-4">
      <h3 className="text-sm font-semibold mb-3 text-cyan-300">Lock & Dam Conditions</h3>

      {/* Danger-level legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {DANGER_LEVELS.filter((d) => d.level !== 'Unknown').map((d) => (
          <span key={d.level} className="flex items-center gap-1 text-[10px] text-white/70">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            {d.level}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[10px] text-white/40">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
          Unknown
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {lockData.map((lock) => {
          const a = lock.activity;
          const isUnknown = !a.sourceAvailable || a.dangerLevel === 'Unknown';

          return (
            <div
              key={lock.id}
              className={`p-2 rounded border text-xs ${a.cardClassName} transition-colors relative`}
              style={a.cardStyle}
            >
              {/* Card header */}
              <div className="font-semibold text-white mb-1 flex items-center justify-between">
                <span className="truncate mr-1">{lock.name}</span>
                {isUnknown ? (
                  <span className="text-[9px] bg-gray-600/30 px-1.5 py-0.5 rounded shrink-0" title="Insufficient data">
                    N/A
                  </span>
                ) : (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${a.badgeClassName}`}
                    style={a.badgeStyle}
                    title="Data source"
                  >
                    {a.sourceTag}
                  </span>
                )}
              </div>

              {/* Card body */}
              <div className="space-y-0.5 text-white/80">
                {isUnknown ? (
                  <>
                    <div className="font-semibold" style={{ color: '#9ca3af' }}>Unknown</div>
                    <div className="text-[10px] text-white/50">
                      {a.gaugeId ? `Gauge ${a.gaugeId} — data unavailable` : 'Gauge data unavailable'}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Danger level + score */}
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-bold" style={{ color: a.dangerColor }}>
                        {a.dangerLevel}
                      </span>
                      {a.dangerScore != null && (
                        <span className="text-[10px] text-white/50">{a.dangerScore}/100</span>
                      )}
                    </div>

                    {/* Confidence */}
                    {a.dangerConfidence && a.dangerConfidence !== 'Unknown' && (
                      <div className="text-[10px] text-white/50">
                        Confidence: {a.dangerConfidence}
                      </div>
                    )}

                    {/* Factor labels */}
                    {a.dangerFactors?.length > 0 && (
                      <div className="text-[10px] text-white/50 leading-tight">
                        {a.dangerFactors.join(' · ')}
                      </div>
                    )}

                    {/* Gauge readings */}
                    {a.gaugeStage != null && (
                      <div>
                        Stage:{' '}
                        <span className="font-semibold">
                          {a.gaugeStage.toFixed(2)} {a.gaugeStageUnits}
                        </span>
                      </div>
                    )}
                    {a.gaugeFlow != null && (
                      <div>
                        Flow:{' '}
                        <span className="font-semibold">
                          {a.gaugeFlow.toFixed(1)} {a.gaugeFlowUnits}
                        </span>
                      </div>
                    )}

                    {!a.hasVerifiedTrafficMetrics && a.estimatedWaitRange && (
                      <div>
                        Est. Wait:{' '}
                        <span className="font-semibold">{a.estimatedWaitRange}</span>
                        <span className="text-[10px] text-white/50"> (model)</span>
                      </div>
                    )}

                    {/* Verified traffic (only when a real traffic source confirms it) */}
                    {a.hasVerifiedTrafficMetrics && (
                      <>
                        <div>
                          Queue: <span className="font-semibold">{a.queueCount ?? 'N/A'}</span> tows
                        </div>
                        <div>
                          Wait: <span className="font-semibold">{a.waitMinutes ?? 'N/A'}</span> min avg
                        </div>
                        <div>
                          Last 24h: <span className="font-semibold">{a.passages24h ?? 'N/A'}</span> passages
                        </div>
                        {a.direction && (
                          <div>
                            {a.direction === 'upstream' ? 'Upstream' : 'Downstream'} traffic
                          </div>
                        )}
                        {a.lastPassage && (
                          <div className="text-[10px] text-white/60 mt-1">
                            Last passage: {new Date(a.lastPassage).toLocaleTimeString()}
                          </div>
                        )}
                      </>
                    )}

                    {/* Source footer */}
                    <div className="text-[10px] text-white/40 mt-1">
                      {a.derivedFromHydrology
                        ? `NOAA gauge estimate${a.gaugeId ? ` · ${a.gaugeId}` : ''}`
                        : (a.source || 'Unknown source')}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[10px] text-white/50 border-t border-white/10 pt-2 space-y-1">
        <p>
          <strong>Danger score</strong> combines river stage, flow, rising trend, wind, and weather
          (0–100). Scores are estimates — check NOAA NWS for official flood information.
        </p>
        <p>
          Tow-traffic metrics (queue, wait, passages) are only shown when verified by a
          public USACE data source.
        </p>
        <p>
          Estimated wait is a planning model based on danger score and trend, not a measured lock queue.
        </p>
      </div>
    </div>
  );
}
