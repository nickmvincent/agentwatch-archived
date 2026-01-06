import { useEffect, useState } from "react";
import type {
  CostStatus,
  HookEnhancementsConfig,
  RulesListResult
} from "../api/types";

const API_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api$/, "")
  : "";

export function HookEnhancementsSection() {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState<HookEnhancementsConfig | null>(null);
  const [costStatus, setCostStatus] = useState<CostStatus | null>(null);
  const [rules, setRules] = useState<RulesListResult | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [configRes, costRes, rulesRes] = await Promise.all([
        fetch(`${API_BASE}/api/hook-enhancements`),
        fetch(`${API_BASE}/api/cost/status`),
        fetch(`${API_BASE}/api/rules`)
      ]);
      if (configRes.ok) setConfig(await configRes.json());
      if (costRes.ok) setCostStatus(await costRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
    } catch {
      // Ignore
    }
  };

  // Count enabled features
  const enabledCount = [
    config?.rules?.enabled,
    config?.auto_permissions?.enabled,
    config?.context_injection?.inject_git_context,
    config?.input_modification?.enabled,
    costStatus?.enabled
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
            Configure token controls, rules, and notifications
          </span>
        </div>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* Feature Toggles Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <FeatureCard
              label="Custom Rules"
              enabled={config?.rules?.enabled}
              description="Block/allow patterns"
              count={rules?.rules?.length}
            />
            <FeatureCard
              label="Auto Permissions"
              enabled={config?.auto_permissions?.enabled}
              description="Auto-approve safe tools"
            />
            <FeatureCard
              label="Git Context"
              enabled={config?.context_injection?.inject_git_context}
              description="Inject git info"
            />
            <FeatureCard
              label="Input Modification"
              enabled={config?.input_modification?.enabled}
              description="Modify tool inputs"
            />
            <FeatureCard
              label="Cost Tracking"
              enabled={costStatus?.enabled}
              description="Track usage costs"
            />
          </div>

          {/* Cost Status */}
          {costStatus?.enabled && (
            <div className="bg-gray-750 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-300">
                  Cost Tracking
                </span>
                {costStatus.limits?.monthly_usd && (
                  <span className="text-xs text-gray-400">
                    Limit: ${costStatus.limits.monthly_usd}/mo
                  </span>
                )}
              </div>
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-gray-400">Today:</span>{" "}
                  <span className="text-white">
                    ${costStatus.daily?.cost_usd?.toFixed(2) ?? "0.00"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Month:</span>{" "}
                  <span className="text-white">
                    ${costStatus.monthly?.cost_usd?.toFixed(2) ?? "0.00"}
                  </span>
                </div>
                {costStatus.limits?.monthly_usd &&
                  costStatus.monthly?.cost_usd && (
                    <div>
                      <span className="text-gray-400">Used:</span>{" "}
                      <span className="text-white">
                        {(
                          (costStatus.monthly.cost_usd /
                            costStatus.limits.monthly_usd) *
                          100
                        ).toFixed(0)}
                        %
                      </span>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Link to Settings */}
          <div className="text-xs text-gray-400">
            Configure these features in{" "}
            <span className="text-cyan-400">Settings → Hook Enhancements</span>
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
  count
}: {
  label: string;
  enabled?: boolean;
  description: string;
  count?: number;
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
    </div>
  );
}
