import { ohioRiverLocks } from "@/lib/locks";
import { normalizeLockActivity } from "@/lib/lockActivity";

/**
 * LockDamMap Component
 *
 * Renders normalized lock activity cards from shared gauge-derived activity data.
 * No bulk /api/lock-status requests are made here.
 */

export default function LockDamMap({ locksData = null, lockActivityById = {} }) {
  const locks = Array.isArray(locksData) && locksData.length > 0 ? locksData : ohioRiverLocks;
  const lockData = locks.map((lock) => ({
    ...lock,
    activity: lockActivityById[lock.id] || normalizeLockActivity(lock, null),
  }));

  // Simple text-based visualization of lock queue and activity
  return (
    <div className="w-full bg-black/40 rounded border border-white/20 p-4">
      <h3 className="text-sm font-semibold mb-3 text-cyan-300">Lock & Dam Activity</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {lockData.map((lock) => {
          const activity = lock.activity;
          const isUnavailable = !activity.sourceAvailable;

          return (
            <div
              key={lock.id}
              className={`p-2 rounded border text-xs ${activity.cardClassName} transition-colors relative`}
              style={activity.cardStyle}
            >
              <div className="font-semibold text-white mb-1 flex items-center justify-between">
                <span>{lock.name}</span>
                {isUnavailable ? (
                  <span className="text-[9px] bg-gray-600/30 px-1.5 py-0.5 rounded" title="Status unavailable">
                    N/A
                  </span>
                ) : (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${activity.badgeClassName}`} style={activity.badgeStyle} title="Normalized lock activity source">
                    {activity.sourceTag}
                  </span>
                )}
              </div>
              <div className="space-y-0.5 text-white/80">
                {isUnavailable ? (
                  <>
                    <div>
                      Queue: <span className="font-semibold">N/A</span> tows
                    </div>
                    <div>
                      Congestion: <span className="font-semibold">{activity.congestionLabel}</span>
                    </div>
                    <div>
                      Wait: <span className="font-semibold">N/A</span> min avg
                    </div>
                    <div>
                      Last 24h: <span className="font-semibold">N/A</span> passages
                    </div>
                    <div className="text-[10px] text-white/60 mt-1">
                      Gauge activity unavailable
                      {activity.gaugeId ? `; ArcGIS gauge: ${activity.gaugeId}` : ''}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      Queue: <span className="font-semibold">{activity.queueCount}</span> tows
                    </div>
                    <div>
                      Congestion: <span className="font-semibold">{activity.congestionLabel}</span> ({activity.congestion.toFixed(0)}%)
                    </div>
                    <div>
                      Wait: <span className="font-semibold">{activity.waitMinutes}</span> min avg
                    </div>
                    <div>
                      Last 24h: <span className="font-semibold">{activity.passages24h}</span> passages
                    </div>
                    <div>
                      {activity.direction === "upstream" ? "Upstream" : "Downstream"} traffic
                    </div>
                    <div className="text-[10px] text-white/60 mt-1">
                      Last passage: {new Date(activity.lastPassage).toLocaleTimeString()}
                    </div>
                    {activity.gaugeDerived && activity.gaugeStage != null ? (
                      <div className="text-[10px] text-cyan-200/90 mt-1">
                        Gauge {activity.gaugeId || 'N/A'}: {activity.gaugeStage.toFixed(2)} {activity.gaugeStageUnits}
                        {activity.gaugeFlow != null ? `, ${activity.gaugeFlow.toFixed(1)} ${activity.gaugeFlowUnits}` : ''}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 text-[10px] text-white/60 border-t border-white/10 pt-2">
        <p className="mb-1">
          <strong>Data Source:</strong> NOAA ArcGIS gauge metadata with normalized gauge-traffic estimates
        </p>
        <p className="mb-1">
          Cards use the same normalized congestion model as the lock map icons.
        </p>
        <p>
          <strong>Note:</strong> Analytics track infrastructure activity, not individual vessels.
        </p>
      </div>
    </div>
  );
}
