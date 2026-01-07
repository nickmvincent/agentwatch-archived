import { useEffect, useState } from "react";
import { fetchConfig, type ConfigData } from "../api/client";

export function HookEnhancementsSection() {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await fetchConfig();
      setConfig(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  const hookConfig = config?.hook_enhancements;
  const costControls = hookConfig?.cost_controls;
  const rulesConfig = hookConfig?.rules;
  const notificationHub = hookConfig?.notification_hub;
  const tokenTracking = hookConfig?.token_tracking;
  const autoContinue = hookConfig?.auto_continue;
  const stopBlocking = hookConfig?.stop_blocking;

  // Count enabled features
  const enabledCount = [
    costControls?.enabled,
    rulesConfig?.enabled,
    notificationHub?.enabled,
    tokenTracking?.enabled,
    autoContinue?.enabled,
    stopBlocking?.enabled
  ].filter(Boolean).length;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">
            Hook Enhancements
          </h3>
          {enabledCount > 0 && (
            <span className="px-2 py-0.5 text-xs bg-purple-600 text-white rounded-full">
              {enabledCount} active
            </span>
          )}
          <span className="text-xs text-gray-400">
            Configure watcher-side hook behavior
          </span>
        </div>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {loading && (
            <div className="text-xs text-gray-500">
              Loading hook settings...
            </div>
          )}

          {/* Feature Toggles Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FeatureCard
              label="Cost Controls"
              enabled={costControls?.enabled}
              description="Budget thresholds and warnings"
            />
            <FeatureCard
              label="Rules"
              enabled={rulesConfig?.enabled}
              description="Policy checks for hooks"
              detail={rulesConfig?.rules_file}
            />
            <FeatureCard
              label="Notifications"
              enabled={notificationHub?.enabled}
              description="Desktop or webhook alerts"
            />
            <FeatureCard
              label="Token Tracking"
              enabled={tokenTracking?.enabled}
              description="Warn on cost thresholds"
            />
            <FeatureCard
              label="Auto Continue"
              enabled={autoContinue?.enabled}
              description="Auto-continue on failures"
            />
            <FeatureCard
              label="Stop Blocking"
              enabled={stopBlocking?.enabled}
              description="Require passing checks"
            />
          </div>

          {/* Cost Controls */}
          {costControls?.enabled && (
            <div className="bg-gray-750 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">
                  Cost Controls
                </span>
              </div>
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-gray-400">Today:</span>{" "}
                  <span className="text-white">
                    ${costControls.daily_limit_usd.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Session:</span>{" "}
                  <span className="text-white">
                    ${costControls.session_limit_usd.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Warn at:</span>{" "}
                  <span className="text-white">
                    {(costControls.warning_threshold * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Link to Settings */}
          <div className="text-xs text-gray-400">
            Configure these values in the watcher settings file below.
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({
  label,
  enabled,
  description,
  count,
  detail
}: {
  label: string;
  enabled?: boolean;
  description: string;
  count?: number;
  detail?: string;
}) {
  return (
    <div
      className={`p-3 rounded border ${
        enabled
          ? "bg-gray-750 border-purple-500/30"
          : "bg-gray-750/50 border-gray-700"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-2 h-2 rounded-full ${
            enabled ? "bg-green-400" : "bg-gray-600"
          }`}
        />
        <span className="text-sm font-medium text-white">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-purple-400">({count})</span>
        )}
      </div>
      <div className="text-xs text-gray-400">{description}</div>
      {detail && (
        <div className="mt-1 text-[10px] text-gray-500 truncate">{detail}</div>
      )}
    </div>
  );
}
