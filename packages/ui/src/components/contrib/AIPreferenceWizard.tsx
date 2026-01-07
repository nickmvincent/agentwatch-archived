/**
 * AIPreferenceWizard - Advanced AI training preference selector.
 *
 * Provides both a simple 5-preset mode and an advanced customization mode
 * for specifying AI/ML usage preferences.
 */

import { useEffect, useState } from "react";
import { HelpIcon } from "../HelpText";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../SelfDocumentingSection";

export interface AIPreferenceWizardProps {
  value: string;
  onChange: (value: string) => void;
}

// Preset definitions
const PRESETS = [
  {
    value: "train-genai=ok",
    label: "Permissive",
    color: "green",
    description:
      "Allow any AI/ML use including commercial AI training. Maximum impact for AI development."
  },
  {
    value: "train-genai=conditional;conditions=open-weights-only",
    label: "Open Only",
    color: "blue",
    description:
      "Only allow use in open-source/open-weights models. No closed commercial models."
  },
  {
    value: "train-genai=conditional;conditions=research-only",
    label: "Research",
    color: "purple",
    description:
      "Allow non-commercial research use only. No commercial applications."
  },
  {
    value: "train-genai=conditional;conditions=eval-only",
    label: "Eval Only",
    color: "yellow",
    description: "Allow evaluation/benchmarking only. No training on this data."
  },
  {
    value: "train-genai=no",
    label: "No AI",
    color: "red",
    description:
      "Do not use for AI training or evaluation. Data for research analysis only."
  }
];

// Parse a preference string into structured form
function parsePreference(pref: string): {
  base: "ok" | "conditional" | "no";
  commercial: boolean;
  attribution: boolean;
  conditions: string[];
} {
  const result = {
    base: "ok" as "ok" | "conditional" | "no",
    commercial: true,
    attribution: false,
    conditions: [] as string[]
  };

  if (pref.includes("train-genai=no")) {
    result.base = "no";
    result.commercial = false;
  } else if (pref.includes("train-genai=conditional")) {
    result.base = "conditional";
    // Parse conditions
    const conditionsMatch = pref.match(/conditions=([^;]+)/);
    if (conditionsMatch?.[1]) {
      result.conditions = conditionsMatch[1].split(",").map((c) => c.trim());
    }
    // Check for commercial restriction
    if (
      result.conditions.includes("research-only") ||
      result.conditions.includes("non-commercial")
    ) {
      result.commercial = false;
    }
  }

  if (pref.includes("attribution=required")) {
    result.attribution = true;
  }

  return result;
}

// Build a preference string from structured form
function buildPreference(parsed: {
  base: "ok" | "conditional" | "no";
  commercial: boolean;
  attribution: boolean;
  conditions: string[];
}): string {
  if (parsed.base === "no") {
    return "train-genai=no";
  }

  if (parsed.base === "ok" && parsed.conditions.length === 0) {
    let result = "train-genai=ok";
    if (parsed.attribution) result += ";attribution=required";
    return result;
  }

  // Conditional
  let result = "train-genai=conditional";
  if (parsed.conditions.length > 0) {
    result += `;conditions=${parsed.conditions.join(",")}`;
  }
  if (parsed.attribution) result += ";attribution=required";
  return result;
}

export function AIPreferenceWizard({
  value,
  onChange
}: AIPreferenceWizardProps) {
  const [advancedMode, setAdvancedMode] = useState(false);
  const [parsed, setParsed] = useState(() => parsePreference(value));
  const showSelfDocs = useSelfDocumentingVisible();

  // Sync parsed state when value changes externally
  useEffect(() => {
    setParsed(parsePreference(value));
  }, [value]);

  // Check if current value matches a preset
  const matchedPreset = PRESETS.find((p) => p.value === value);

  const handlePresetClick = (presetValue: string) => {
    onChange(presetValue);
  };

  const handleAdvancedChange = (newParsed: typeof parsed) => {
    setParsed(newParsed);
    onChange(buildPreference(newParsed));
  };

  const toggleCondition = (condition: string) => {
    const newConditions = parsed.conditions.includes(condition)
      ? parsed.conditions.filter((c) => c !== condition)
      : [...parsed.conditions, condition];
    handleAdvancedChange({
      ...parsed,
      conditions: newConditions,
      base: newConditions.length > 0 ? "conditional" : "ok"
    });
  };

  const colorClasses: Record<string, string> = {
    green: "bg-green-600/30 border-green-500 text-green-300",
    blue: "bg-blue-600/30 border-blue-500 text-blue-300",
    purple: "bg-purple-600/30 border-purple-500 text-purple-300",
    yellow: "bg-yellow-600/30 border-yellow-500 text-yellow-300",
    red: "bg-red-600/30 border-red-500 text-red-300"
  };

  return (
    <SelfDocumentingSection
      componentId="static.share.ai-preference-wizard"
      visible={showSelfDocs}
    >
      <div className="p-2 bg-gray-900/50 rounded space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-gray-300 flex items-center gap-1">
            AI Training Preference
            <HelpIcon tooltip="Choose how your data can be used for AI/ML purposes. This preference is embedded in your contribution and follows the W3C TDM Repertoire standard." />
          </div>
          <button
            onClick={() => setAdvancedMode(!advancedMode)}
            className="text-[10px] text-gray-500 hover:text-gray-300"
          >
            {advancedMode ? "Simple" : "Advanced"}
          </button>
        </div>

        {!advancedMode ? (
          // Simple mode: 5 presets
          <div className="grid grid-cols-5 gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetClick(preset.value)}
                title={preset.description}
                className={`p-1.5 rounded text-center text-xs transition-colors ${
                  value === preset.value
                    ? colorClasses[preset.color]
                    : "bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-500"
                } border`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : (
          // Advanced mode: customization wizard
          <div className="space-y-3">
            {/* Base permission */}
            <div>
              <div className="text-[10px] text-gray-500 mb-1">
                Base Permission
              </div>
              <div className="flex gap-1">
                {(["ok", "conditional", "no"] as const).map((base) => (
                  <button
                    key={base}
                    onClick={() => handleAdvancedChange({ ...parsed, base })}
                    className={`px-2 py-1 text-xs rounded ${
                      parsed.base === base
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                    }`}
                  >
                    {base === "ok"
                      ? "Allow"
                      : base === "conditional"
                        ? "Conditional"
                        : "Deny"}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditions (only if conditional or ok) */}
            {parsed.base !== "no" && (
              <div>
                <div className="text-[10px] text-gray-500 mb-1">Conditions</div>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: "open-weights-only", label: "Open Weights" },
                    { id: "research-only", label: "Research Only" },
                    { id: "eval-only", label: "Eval Only" },
                    { id: "no-synthetic", label: "No Synthetic" }
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => toggleCondition(id)}
                      className={`px-1.5 py-0.5 text-xs rounded ${
                        parsed.conditions.includes(id)
                          ? "bg-purple-600 text-white"
                          : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Attribution */}
            <div>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={parsed.attribution}
                  onChange={(e) =>
                    handleAdvancedChange({
                      ...parsed,
                      attribution: e.target.checked
                    })
                  }
                  className="rounded"
                />
                Require attribution
              </label>
            </div>

            {/* Raw value display */}
            <div className="p-1.5 bg-gray-800 rounded">
              <div className="text-[10px] text-gray-500 mb-0.5">Signal</div>
              <code className="text-[10px] text-gray-400 break-all">
                {value}
              </code>
            </div>
          </div>
        )}

        {/* Description of current selection */}
        <div className="text-[10px] text-gray-500">
          {matchedPreset?.description || "Custom preference configuration"}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
