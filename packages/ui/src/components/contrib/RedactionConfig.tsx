/**
 * RedactionConfig - Configuration panel for redaction settings.
 */

import type { RedactionConfig as RedactionConfigType } from "@agentwatch/pre-share";
import { HELP_CONTENT, HelpIcon } from "../HelpText";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "../SelfDocumentingSection";

export interface RedactionConfigProps {
  config: RedactionConfigType;
  onChange: (config: RedactionConfigType) => void;
}

export function RedactionConfig({ config, onChange }: RedactionConfigProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const handleToggle = (key: keyof RedactionConfigType) => {
    onChange({ ...config, [key]: !config[key] });
  };

  const handleAddPattern = (pattern: string) => {
    const newPatterns = [...(config.customRegex || []), pattern];
    onChange({ ...config, customRegex: newPatterns });
  };

  const handleRemovePattern = (idx: number) => {
    const newPatterns = config.customRegex?.filter((_, i) => i !== idx);
    onChange({ ...config, customRegex: newPatterns });
  };

  return (
    <SelfDocumentingSection
      title="Redaction config"
      componentId="static.share.redaction-config"
      notes={[
        "Toggles redact secrets, PII, and paths.",
        "Custom regex patterns are appended to the rule set."
      ]}
      visible={showSelfDocs}
    >
      <div className="p-3 bg-gray-900/50 rounded">
        <div className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
          Redaction
          <HelpIcon tooltip="Automatic detection and removal of sensitive content from your transcripts." />
        </div>
        <div className="space-y-2 text-xs">
          {[
            {
              key: "redactSecrets",
              label: "Secrets",
              desc: HELP_CONTENT.redactionTypes.secrets
            },
            {
              key: "redactPii",
              label: "PII",
              desc: HELP_CONTENT.redactionTypes.pii
            },
            {
              key: "redactPaths",
              label: "Paths",
              desc: HELP_CONTENT.redactionTypes.paths
            }
          ].map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-center gap-2 text-gray-300 hover:text-white cursor-pointer"
              title={desc}
            >
              <input
                type="checkbox"
                checked={config[key as keyof RedactionConfigType] as boolean}
                onChange={() => handleToggle(key as keyof RedactionConfigType)}
                className="rounded"
              />
              <span>{label}</span>
              <HelpIcon tooltip={desc} />
            </label>
          ))}
        </div>

        {/* Custom patterns */}
        <div className="mt-3 pt-2 border-t border-gray-700">
          <div className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            Custom patterns
            <HelpIcon tooltip={HELP_CONTENT.customPatterns} />
          </div>
          <div className="flex gap-1 mb-2">
            <input
              type="text"
              placeholder="Enter regex or text to redact..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  handleAddPattern(e.currentTarget.value.trim());
                  e.currentTarget.value = "";
                }
              }}
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-xs placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={(e) => {
                const input = (e.currentTarget as HTMLButtonElement)
                  .previousElementSibling as HTMLInputElement;
                if (input?.value.trim()) {
                  handleAddPattern(input.value.trim());
                  input.value = "";
                }
              }}
              className="px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 text-xs"
            >
              Add
            </button>
          </div>
          {config.customRegex && config.customRegex.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {config.customRegex.map((pattern, idx) => (
                <span
                  key={idx}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-900/50 text-orange-300 rounded text-xs"
                >
                  <code className="font-mono text-[10px] max-w-[100px] truncate">
                    {pattern}
                  </code>
                  <button
                    onClick={() => handleRemovePattern(idx)}
                    className="text-orange-400 hover:text-orange-200"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-gray-500 mt-1">
            Examples: my-project-name, MyCompany, \b192\.168\.\d+\.\d+\b
          </div>
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
