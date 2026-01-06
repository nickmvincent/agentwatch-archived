import { useEffect, useMemo, useState } from "react";
import {
  type ConfigData,
  type HookEnhancementsConfig,
  createProject,
  deleteProject,
  fetchClaudeSettings,
  fetchHookEnhancements,
  fetchProjects,
  fetchQualityConfig,
  fetchRawConfig,
  replaceClaudeSettings,
  saveRawConfig,
  updateClaudeSettings,
  updateConfig,
  updateHookEnhancements,
  updateProject
} from "../api/client";
import type {
  ClaudeSettings,
  ClaudeSettingsHookGroup,
  ClaudeSettingsResponse,
  Project,
  QualityConfigResult
} from "../api/types";
import { useData } from "../context/DataProvider";
import { AuditLogPane } from "./AuditLogPane";
import { ReferencePane } from "./ReferencePane";
import { Toast } from "./Toast";
import { InfoTooltip } from "./ui/InfoTooltip";

type HideableTab = "ports";

interface SettingsPaneProps {
  hiddenTabs: Set<HideableTab>;
  onToggleTabVisibility: (tab: HideableTab) => void;
}

export function SettingsPane({
  hiddenTabs,
  onToggleTabVisibility
}: SettingsPaneProps) {
  const { getConfig, invalidate } = useData();
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async (invalidateFirst = false) => {
    if (invalidateFirst) {
      invalidate("/api/config");
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getConfig();
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (path: string, value: boolean) => {
    if (!config) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      // Build nested update object from path
      const parts = path.split(".");
      const update: Record<string, unknown> = {};
      let current: Record<string, unknown> = update;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = {};
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;

      const result = await updateConfig(update);
      if (result.success) {
        setSaveMessage(`Updated: ${result.updates.join(", ")}`);
        // Reload config with fresh data (invalidate cache first)
        await loadConfig(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-center py-8 text-gray-500">
          Loading configuration...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400">
          {error}
        </div>
        <button
          onClick={() => loadConfig()}
          className="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!config) return null;

  const tocItems = [
    { id: "visible-tabs", label: "Visible Tabs" },
    { id: "projects", label: "Projects" },
    { id: "conversations", label: "Conversations" },
    { id: "redaction-profiles", label: "Redaction" },
    { id: "quality-scoring", label: "Quality Scoring" },
    { id: "notifications", label: "Notifications" },
    { id: "hook-enhancements", label: "Hook Enhancements" },
    { id: "claude-settings", label: "Claude Code" },
    { id: "test-gate", label: "Test Gate" },
    { id: "activity", label: "Activity" },
    { id: "config-info", label: "Config Info" },
    { id: "external-reference", label: "Reference" },
    { id: "raw-files", label: "Raw Files" }
  ];

  return (
    <div className="space-y-6">
      <Toast message={saveMessage} onDismiss={() => setSaveMessage(null)} />

      {/* Settings Overview Header */}
      <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-2">
          Settings Manager
        </h2>
        <p className="text-sm text-gray-300 mb-3">
          This page provides a visual interface for editing your configuration
          files. Changes are saved automatically.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2 p-2 bg-gray-800/50 rounded">
            <span className="text-blue-400 mt-0.5">📁</span>
            <div>
              <code className="text-blue-300">
                ~/.config/agentwatch/config.toml
              </code>
              <p className="text-gray-400 mt-0.5">
                AgentWatch daemon settings: notifications, test gates, hook
                enhancements
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-2 bg-gray-800/50 rounded">
            <span className="text-purple-400 mt-0.5">📁</span>
            <div>
              <code className="text-purple-300">~/.claude/settings.json</code>
              <p className="text-gray-400 mt-0.5">
                Claude Code settings: hooks, permissions, MCP servers
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3">
        <div className="flex flex-wrap gap-2">
          {tocItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Visible Tabs */}
      <div
        id="visible-tabs"
        className="bg-gray-800 rounded-lg p-4 scroll-mt-16"
      >
        <h2 className="text-lg font-semibold text-white mb-2">Visible Tabs</h2>
        <p className="text-sm text-gray-400 mb-2">
          Toggle optional tabs. Hidden tabs won't fetch data, reducing network
          overhead.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Stored in:{" "}
          <code className="bg-gray-700 px-1 rounded">
            ~/.config/agentwatch/config.toml
          </code>{" "}
          (syncs across browsers)
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!hiddenTabs.has("ports")}
              onChange={() => onToggleTabVisibility("ports")}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            <span className="text-gray-300">Ports</span>
            <span className="text-xs text-gray-500">
              (Shows listening dev server ports)
            </span>
          </label>
        </div>
      </div>

      {/* Projects */}
      <div id="projects" className="scroll-mt-16">
        <ProjectsSettingsSection />
      </div>

      {/* Conversations Settings */}
      <div id="conversations" className="scroll-mt-16">
        <ConversationsSettingsSection
          transcriptDays={config.conversations?.transcript_days ?? 30}
          includeProcessSnapshots={
            config.conversations?.include_process_snapshots ?? false
          }
          saving={saving}
          onUpdateTranscriptDays={async (days: number) => {
            setSaving(true);
            setSaveMessage(null);
            try {
              const result = await updateConfig({
                conversations: { transcript_days: days }
              });
              if (result.success) {
                setSaveMessage(`Updated: ${result.updates.join(", ")}`);
                await loadConfig(true);
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save");
            } finally {
              setSaving(false);
              setTimeout(() => setSaveMessage(null), 3000);
            }
          }}
          onToggleProcessSnapshots={async (enabled: boolean) => {
            setSaving(true);
            setSaveMessage(null);
            try {
              const result = await updateConfig({
                conversations: { include_process_snapshots: enabled }
              });
              if (result.success) {
                setSaveMessage(`Updated: ${result.updates.join(", ")}`);
                await loadConfig(true);
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to save");
            } finally {
              setSaving(false);
              setTimeout(() => setSaveMessage(null), 3000);
            }
          }}
        />
      </div>

      {/* Redaction Profiles */}
      <div id="redaction-profiles" className="scroll-mt-16">
        <RedactionProfilesSection />
      </div>

      {/* Quality Scoring Configuration */}
      <div id="quality-scoring" className="scroll-mt-16">
        <QualityConfigSection />
      </div>

      {/* Notifications */}
      <div
        id="notifications"
        className="bg-gray-800 rounded-lg p-4 scroll-mt-16"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              Desktop Notifications
            </h2>
            <span
              className={`px-2 py-0.5 text-xs rounded ${config.notifications.enable ? "bg-green-600 text-white" : "bg-gray-600 text-gray-300"}`}
            >
              {config.notifications.enable ? "ON" : "OFF"}
            </span>
          </div>
          <button
            onClick={() =>
              handleToggle("notifications.enable", !config.notifications.enable)
            }
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.notifications.enable ? "bg-green-600" : "bg-gray-600"
            } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.notifications.enable ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-2">
          Get macOS notifications for Claude Code hook events. Useful for
          staying aware when Claude needs input or finishes work.
        </p>
        <p className="text-xs text-gray-500 mb-4">
          Stored in:{" "}
          <code className="bg-gray-700 px-1 rounded">
            ~/.config/agentwatch/config.toml
          </code>
        </p>

        {/* Notification Format Options */}
        <div
          className={`mb-6 p-3 bg-gray-700/50 rounded-lg ${!config.notifications.enable ? "opacity-50 pointer-events-none" : ""}`}
        >
          <div className="text-xs text-blue-400 font-medium mb-3">
            Notification Content
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Choose what information appears in notifications. Project name is
            derived from your working directory.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={
                  config.hook_enhancements?.notification_hub?.desktop?.format
                    ?.show_project_name ?? true
                }
                onChange={(e) =>
                  handleToggle(
                    "hook_enhancements.notification_hub.desktop.format.show_project_name",
                    e.target.checked
                  )
                }
                disabled={saving}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-gray-300">Project name</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={
                  config.hook_enhancements?.notification_hub?.desktop?.format
                    ?.show_session_id ?? true
                }
                onChange={(e) =>
                  handleToggle(
                    "hook_enhancements.notification_hub.desktop.format.show_session_id",
                    e.target.checked
                  )
                }
                disabled={saving}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-gray-300">Session ID</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={
                  config.hook_enhancements?.notification_hub?.desktop?.format
                    ?.show_tool_details ?? true
                }
                onChange={(e) =>
                  handleToggle(
                    "hook_enhancements.notification_hub.desktop.format.show_tool_details",
                    e.target.checked
                  )
                }
                disabled={saving}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-gray-300">Tool details</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={
                  config.hook_enhancements?.notification_hub?.desktop?.format
                    ?.show_stats ?? false
                }
                onChange={(e) =>
                  handleToggle(
                    "hook_enhancements.notification_hub.desktop.format.show_stats",
                    e.target.checked
                  )
                }
                disabled={saving}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-gray-300">Stats (tokens, tools)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={
                  config.hook_enhancements?.notification_hub?.desktop?.format
                    ?.show_cwd ?? false
                }
                onChange={(e) =>
                  handleToggle(
                    "hook_enhancements.notification_hub.desktop.format.show_cwd",
                    e.target.checked
                  )
                }
                disabled={saving}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500"
              />
              <span className="text-gray-300">Full path (cwd)</span>
            </label>
          </div>

          {/* Live preview of notification appearance */}
          <NotificationPreview
            format={{
              showProjectName:
                config.hook_enhancements?.notification_hub?.desktop?.format
                  ?.show_project_name ?? true,
              showSessionId:
                config.hook_enhancements?.notification_hub?.desktop?.format
                  ?.show_session_id ?? true,
              showToolDetails:
                config.hook_enhancements?.notification_hub?.desktop?.format
                  ?.show_tool_details ?? true,
              showStats:
                config.hook_enhancements?.notification_hub?.desktop?.format
                  ?.show_stats ?? false,
              showCwd:
                config.hook_enhancements?.notification_hub?.desktop?.format
                  ?.show_cwd ?? false
            }}
          />
        </div>

        <div
          className={`space-y-2 ${!config.notifications.enable ? "opacity-50 pointer-events-none" : ""}`}
        >
          {/* Highly recommended notifications */}
          <div className="text-xs text-green-400 font-medium mb-2">
            Recommended - high value, low noise:
          </div>

          <NotificationToggle
            label="Awaiting Input"
            description="Claude needs your approval to continue"
            recommendation="Essential - don't miss permission prompts"
            enabled={config.notifications.hook_awaiting_input}
            onChange={(v) =>
              handleToggle("notifications.hook_awaiting_input", v)
            }
            saving={saving}
          />

          <NotificationToggle
            label="Session End"
            description="Claude finished and session completed"
            recommendation="Useful - know when work is done"
            enabled={config.notifications.hook_session_end}
            onChange={(v) => handleToggle("notifications.hook_session_end", v)}
            saving={saving}
          />

          <NotificationToggle
            label="Stop (Turn Complete)"
            description="Claude finished responding and is waiting"
            recommendation="Useful - know when to review output"
            enabled={config.notifications.hook_stop}
            onChange={(v) => handleToggle("notifications.hook_stop", v)}
            saving={saving}
          />

          <NotificationToggle
            label="Tool Failure"
            description="A tool call failed (read error, command failed, etc.)"
            recommendation="Useful - catch errors early"
            enabled={config.notifications.hook_tool_failure}
            onChange={(v) => handleToggle("notifications.hook_tool_failure", v)}
            saving={saving}
          />

          {/* Moderate value notifications */}
          <div className="text-xs text-yellow-400 font-medium mt-4 mb-2">
            Moderate value - can be noisy:
          </div>

          <NotificationToggle
            label="Permission Request"
            description="User approved or denied a permission"
            recommendation="Verbose - mostly for debugging"
            enabled={config.notifications.hook_permission_request}
            onChange={(v) =>
              handleToggle("notifications.hook_permission_request", v)
            }
            saving={saving}
          />

          <NotificationToggle
            label="Subagent Stop"
            description="A Task agent completed its work"
            recommendation="Useful if using many subagents"
            enabled={config.notifications.hook_subagent_stop}
            onChange={(v) =>
              handleToggle("notifications.hook_subagent_stop", v)
            }
            saving={saving}
          />

          {/* Noisy/Debug notifications */}
          <div className="text-xs text-gray-500 font-medium mt-4 mb-2">
            Very verbose - mainly for learning/debugging:
          </div>

          <NotificationToggle
            label="Session Start"
            description="New or resumed Claude session started"
            recommendation="Verbose - one per conversation"
            enabled={config.notifications.hook_session_start}
            onChange={(v) =>
              handleToggle("notifications.hook_session_start", v)
            }
            saving={saving}
          />

          <NotificationToggle
            label="User Prompt Submit"
            description="You submitted a prompt"
            recommendation="Verbose - you already know you sent it"
            enabled={config.notifications.hook_user_prompt_submit}
            onChange={(v) =>
              handleToggle("notifications.hook_user_prompt_submit", v)
            }
            saving={saving}
          />

          <NotificationToggle
            label="Pre Tool Use"
            description="Claude is about to execute a tool"
            recommendation="Very noisy - fires for every tool call"
            enabled={config.notifications.hook_pre_tool_use}
            onChange={(v) => handleToggle("notifications.hook_pre_tool_use", v)}
            saving={saving}
          />

          <NotificationToggle
            label="Post Tool Use"
            description="Tool execution completed"
            recommendation="Very noisy - fires for every tool call"
            enabled={config.notifications.hook_post_tool_use}
            onChange={(v) =>
              handleToggle("notifications.hook_post_tool_use", v)
            }
            saving={saving}
          />

          <NotificationToggle
            label="Notification Hook"
            description="Claude sent a notification message"
            recommendation="Rare - depends on Claude's behavior"
            enabled={config.notifications.hook_notification}
            onChange={(v) => handleToggle("notifications.hook_notification", v)}
            saving={saving}
          />

          <NotificationToggle
            label="Pre Compact"
            description="Context about to be compacted"
            recommendation="Rare - only on long conversations"
            enabled={config.notifications.hook_pre_compact}
            onChange={(v) => handleToggle("notifications.hook_pre_compact", v)}
            saving={saving}
          />
        </div>
      </div>

      {/* Hook Enhancements */}
      <div id="hook-enhancements" className="scroll-mt-16">
        <HookEnhancementsSection />
      </div>

      {/* Claude Code Settings */}
      <div id="claude-settings" className="scroll-mt-16">
        <ClaudeSettingsSection />
      </div>

      {/* Test Gate */}
      <div id="test-gate" className="bg-gray-800 rounded-lg p-4 scroll-mt-16">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-white">Test Gate</h2>
          <span className="px-2 py-0.5 text-xs bg-blue-600 rounded text-white">
            Interactive
          </span>
        </div>
        <p className="text-sm text-gray-400 mb-2">
          Require tests to pass before git commits. Uses Claude Code hooks.
        </p>
        <div className="p-2 bg-blue-900/20 border border-blue-800/30 rounded mb-4">
          <p className="text-xs text-blue-300">
            <strong>How it works:</strong> When enabled, a{" "}
            <code className="bg-gray-700 px-1 rounded">PreToolUse</code> hook
            intercepts{" "}
            <code className="bg-gray-700 px-1 rounded">git commit</code>{" "}
            commands. The hook checks if your test command has recently passed
            (within max age). If not, the commit is blocked and Claude is
            prompted to run tests first.
          </p>
        </div>

        <div className="space-y-3">
          <ToggleRow
            label="Enable Test Gate"
            description={`Block commits unless tests pass (${config.test_gate.test_command || "no command set"})`}
            enabled={config.test_gate.enabled}
            onChange={(v) => handleToggle("test_gate.enabled", v)}
            saving={saving}
            tooltip="When enabled, a PreToolUse hook intercepts git commit commands and checks if tests have passed recently. If the pass file is missing or too old, the commit is blocked and Claude is prompted to run tests first. Configure test_command and pass_file_max_age_seconds in config.toml."
          />

          <div className="mt-2 p-2 bg-gray-700/50 rounded text-xs text-gray-400 space-y-1">
            <div>
              <span className="text-gray-500">Test command:</span>{" "}
              <code className="bg-gray-600 px-1 rounded">
                {config.test_gate.test_command || "not set"}
              </code>
            </div>
            <div>
              <span className="text-gray-500">Pass file:</span>{" "}
              <code className="bg-gray-600 px-1 rounded">
                {config.test_gate.pass_file}
              </code>
            </div>
            <div>
              <span className="text-gray-500">Max age:</span>{" "}
              {config.test_gate.pass_file_max_age_seconds}s (tests older than
              this require re-run)
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Configure in:{" "}
            <code className="bg-gray-700 px-1 rounded">
              ~/.config/agentwatch/config.toml
            </code>
          </p>
        </div>
      </div>

      {/* Activity / Audit Log Section */}
      <ActivitySection />

      {/* Info Section */}
      <div id="config-info" className="bg-gray-800 rounded-lg p-4 scroll-mt-16">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-white">
            Configuration Info
          </h2>
          <span className="px-2 py-0.5 text-xs bg-gray-600 rounded text-gray-400">
            Read-only
          </span>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Daemon</span>
            <span className="text-white font-mono">
              {config.daemon.host}:{config.daemon.port}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Repository Roots</span>
            <span className="text-white">{config.roots.length} configured</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Agent Matchers</span>
            <span className="text-white">
              {config.agents.matchers.length} patterns
            </span>
          </div>

          <div className="mt-4 p-3 bg-gray-700/50 rounded">
            <div className="text-xs text-gray-400 mb-2">
              Detected Agent Types:
            </div>
            <div className="flex flex-wrap gap-2">
              {config.agents.matchers.map((m) => (
                <span
                  key={m.label}
                  className="px-2 py-1 bg-gray-600 rounded text-xs text-gray-300"
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* External Reference - expandable section */}
      <div id="external-reference" className="scroll-mt-16">
        <ExternalReferenceSection />
      </div>

      {/* Raw Config Files - at bottom */}
      <div id="raw-files" className="scroll-mt-16">
        <RawFilesSection />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  saving,
  disabled = false,
  tooltip
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  saving: boolean;
  disabled?: boolean;
  /** Optional detailed help text shown on hover */
  tooltip?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between ${disabled ? "opacity-50" : ""}`}
    >
      <div>
        <div className="text-white text-sm font-medium flex items-center gap-1.5">
          {label}
          {tooltip && <InfoTooltip content={tooltip} />}
        </div>
        <div className="text-gray-500 text-xs">{description}</div>
      </div>
      <button
        onClick={() => !disabled && !saving && onChange(!enabled)}
        disabled={disabled || saving}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-blue-600" : "bg-gray-600"
        } ${disabled || saving ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// Quality Scoring Configuration Section - view-only display of quality weights
function QualityConfigSection() {
  const [config, setConfig] = useState<QualityConfigResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQualityConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-2">
          Quality Scoring Configuration
        </h2>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-2">
          Quality Scoring Configuration
        </h2>
        <p className="text-red-400">Failed to load quality config</p>
      </div>
    );
  }

  const dimensionTotal = Object.values(config.dimension_weights).reduce(
    (a, b) => a + b,
    0
  );
  const signalTotal = Object.values(config.signal_weights).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold text-white mb-2">
        Quality Scoring Configuration
      </h2>
      <p className="text-sm text-gray-400 mb-4">
        Quality scores are calculated using weighted dimensions. This
        configuration is view-only and is included when sharing data bundles.
      </p>

      {/* Dimension Weights */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-white mb-2">
          Dimension Weights ({dimensionTotal}%)
        </h3>
        <div className="space-y-2">
          {Object.entries(config.dimension_weights).map(([key, weight]) => {
            const displayKey = key
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            const description = config.dimension_descriptions[key] || key;
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{displayKey}</span>
                  <span className="text-blue-400 font-mono">{weight}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded mt-1">
                  <div
                    className="h-2 bg-blue-600 rounded"
                    style={{ width: `${weight}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signal Weights */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-white mb-2">
          Heuristic Signal Weights ({signalTotal}%)
        </h3>
        <div className="space-y-2">
          {Object.entries(config.signal_weights).map(([key, weight]) => {
            const displayKey = key
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
            const description = config.signal_descriptions[key] || key;
            return (
              <div key={key} className="flex items-start gap-2">
                <span className="text-purple-400 font-mono text-sm w-8">
                  {weight}%
                </span>
                <div className="flex-1">
                  <span className="text-gray-300 text-sm">{displayKey}</span>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        These weights are bundled with shared data for reproducibility.
      </p>
    </div>
  );
}

// Conversations Settings Section - days selector, process snapshots, and correlation explanation
function ConversationsSettingsSection({
  transcriptDays,
  includeProcessSnapshots,
  saving,
  onUpdateTranscriptDays,
  onToggleProcessSnapshots
}: {
  transcriptDays: number;
  includeProcessSnapshots: boolean;
  saving: boolean;
  onUpdateTranscriptDays: (days: number) => void;
  onToggleProcessSnapshots: (enabled: boolean) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold text-white mb-2">Conversations</h2>
      <p className="text-sm text-gray-400 mb-4">
        Configure how conversations are discovered and displayed across
        Conversations, Analytics, and Share tabs.
      </p>

      {/* Days selector */}
      <div className="mb-4">
        <label className="text-sm text-gray-300 mb-2 flex items-center gap-1.5">
          Show conversations from last:
          <InfoTooltip content="Controls how far back to scan for transcripts and hook sessions. Larger values load more data but may be slower. Affects Conversations, Analytics, and Share tabs." />
        </label>
        <div className="flex gap-2">
          {[1, 7, 14, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => onUpdateTranscriptDays(days)}
              disabled={saving}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                transcriptDays === days
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {days}d
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          This setting controls all tabs. Stored in:{" "}
          <code className="bg-gray-700 px-1 rounded">
            ~/.config/agentwatch/config.toml
          </code>
        </p>
      </div>

      {/* Process Snapshots toggle */}
      <div className="mb-4 p-3 bg-cyan-900/20 border border-cyan-800/30 rounded">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-cyan-300 flex items-center gap-1.5">
              Include Process Snapshots
              <InfoTooltip content="Process snapshots are created by the daemon's process scanner. They provide a lightweight record of agent activity even when hooks aren't installed. Useful for seeing 'gaps' in your conversation data." />
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Add lightweight activity markers for coding sessions without hooks
              or transcripts. Shows evidence of agent usage from{" "}
              <code className="bg-gray-700 px-1 rounded">
                ~/.agentwatch/processes/
              </code>
            </p>
          </div>
          <button
            onClick={() => onToggleProcessSnapshots(!includeProcessSnapshots)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              includeProcessSnapshots ? "bg-cyan-600" : "bg-gray-600"
            } ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                includeProcessSnapshots ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Correlation explanation */}
      <div className="p-3 bg-blue-900/20 border border-blue-800/30 rounded">
        <h3 className="text-sm font-medium text-blue-300 mb-2">
          How conversation linking works
        </h3>
        <p className="text-xs text-gray-400 mb-2">
          Agentwatch automatically links hook sessions (real-time tool tracking)
          with transcript files (conversation history) into unified
          "conversations":
        </p>
        <ul className="text-xs text-gray-400 space-y-1 ml-4 list-disc">
          <li>
            <span className="text-green-400">Exact match</span> — Transcript
            path matches directly (highest confidence)
          </li>
          <li>
            <span className="text-yellow-400">Linked</span> — Matched by working
            directory and timing (±5 seconds)
          </li>
          <li>
            <span className="text-gray-500">Partial</span> — Only hook data or
            only transcript available
          </li>
          {includeProcessSnapshots && (
            <li>
              <span className="text-cyan-400">Process only</span> — Lightweight
              activity marker (no conversation content)
            </li>
          )}
        </ul>
        <p className="text-xs text-gray-500 mt-2">
          Linked conversations provide richer data: hook metadata + full
          transcript history.
        </p>
      </div>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  recommendation,
  enabled,
  onChange,
  saving
}: {
  label: string;
  description: string;
  recommendation: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-700/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">{label}</span>
          <span
            className={`text-xs ${enabled ? "text-green-400" : "text-gray-500"}`}
          >
            {enabled ? "ON" : "OFF"}
          </span>
        </div>
        <div className="text-gray-500 text-xs">{description}</div>
        <div className="text-gray-600 text-[10px] italic">{recommendation}</div>
      </div>
      <button
        onClick={() => !saving && onChange(!enabled)}
        disabled={saving}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-2 flex-shrink-0 ${
          enabled ? "bg-green-600" : "bg-gray-600"
        } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// Notification Preview - shows example notifications based on format settings
function NotificationPreview({
  format
}: {
  format: {
    showProjectName: boolean;
    showSessionId: boolean;
    showToolDetails: boolean;
    showStats: boolean;
    showCwd: boolean;
  };
}) {
  // Example notification data
  const examples = [
    {
      hookType: "Session End",
      rawTitle: "Session Ended",
      rawMessage: "Session ended (2m 34s)",
      cwd: "/Users/dev/my-project",
      sessionId: "abc12345-6789-def0",
      toolCount: 12,
      inputTokens: 45200,
      outputTokens: 8300
    },
    {
      hookType: "Awaiting Input",
      rawTitle: "Awaiting Input",
      rawMessage: "Claude needs approval to continue",
      cwd: "/Users/dev/my-project",
      sessionId: "abc12345-6789-def0",
      toolName: "Bash",
      toolInput: { command: "rm -rf node_modules && npm install" }
    },
    {
      hookType: "Stop",
      rawTitle: "Turn Complete",
      rawMessage: "Claude finished responding",
      cwd: "/Users/dev/my-project",
      sessionId: "abc12345-6789-def0",
      toolCount: 5,
      inputTokens: 12400,
      outputTokens: 3200
    }
  ];

  // Format notification based on settings (mirrors desktop.ts logic)
  const formatNotification = (example: (typeof examples)[0]) => {
    let title = example.rawTitle;
    if (format.showProjectName && example.cwd) {
      const projectName = example.cwd.split("/").pop() || "";
      if (projectName) title = projectName;
    }

    const subtitleParts: string[] = [];
    if (format.showSessionId && example.sessionId) {
      subtitleParts.push(example.sessionId.slice(0, 8));
    }
    if (format.showToolDetails && example.toolName && example.toolInput) {
      const cmd = (example.toolInput as { command?: string }).command;
      if (cmd) {
        subtitleParts.push(cmd.length > 40 ? cmd.slice(0, 37) + "..." : cmd);
      }
    }
    if (format.showStats) {
      const parts: string[] = [];
      if (example.toolCount) {
        parts.push(
          `${example.toolCount} tool${example.toolCount !== 1 ? "s" : ""}`
        );
      }
      if (example.inputTokens || example.outputTokens) {
        const inTok = example.inputTokens ?? 0;
        const outTok = example.outputTokens ?? 0;
        const formatTok = (t: number) =>
          t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(t);
        parts.push(`${formatTok(inTok)}/${formatTok(outTok)} tok`);
      }
      if (parts.length) subtitleParts.push(parts.join(", "));
    }
    if (format.showCwd && example.cwd) {
      subtitleParts.push(example.cwd);
    }

    return {
      title,
      message: example.rawMessage,
      subtitle:
        subtitleParts.length > 0 ? subtitleParts.join(" | ") : undefined,
      hookType: example.hookType
    };
  };

  return (
    <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
      <div className="text-xs text-gray-400 font-medium mb-3">Preview</div>
      <div className="space-y-3">
        {examples.map((example, i) => {
          const formatted = formatNotification(example);
          return (
            <div key={i} className="relative">
              {/* Hook type label */}
              <div className="absolute -top-1 -left-1 px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-400">
                {example.hookType}
              </div>
              {/* macOS notification mockup */}
              <div className="bg-gray-800/90 backdrop-blur rounded-xl p-3 pl-4 shadow-lg border border-gray-600/50 ml-4 mt-2">
                <div className="flex items-start gap-3">
                  {/* App icon placeholder */}
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
                    AW
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium truncate">
                        {formatted.title}
                      </span>
                      <span className="text-gray-500 text-xs flex-shrink-0">
                        now
                      </span>
                    </div>
                    <div className="text-gray-300 text-xs mt-0.5 truncate">
                      {formatted.message}
                    </div>
                    {formatted.subtitle && (
                      <div className="text-gray-500 text-[11px] mt-0.5 truncate">
                        {formatted.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-600 mt-3 text-center">
        Actual appearance depends on macOS notification settings
      </p>
    </div>
  );
}

// Projects Settings Section - manage project definitions for cwd matching
function ProjectsSettingsSection() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form state
  const [formId, setFormId] = useState("");
  const [formName, setFormName] = useState("");
  const [formPaths, setFormPaths] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const resetForm = () => {
    setFormId("");
    setFormName("");
    setFormPaths("");
    setFormDescription("");
    setEditingId(null);
    setShowAddForm(false);
  };

  const startEditing = (project: Project) => {
    setFormId(project.id);
    setFormName(project.name);
    setFormPaths(project.paths.join("\n"));
    setFormDescription(project.description || "");
    setEditingId(project.id);
    setShowAddForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const paths = formPaths
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    try {
      if (editingId) {
        await updateProject(editingId, {
          name: formName,
          paths,
          description: formDescription || undefined
        });
      } else {
        await createProject({
          id: formId.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          name: formName,
          paths,
          description: formDescription || undefined
        });
      }
      await loadProjects();
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete project "${id}"?`)) return;
    setSaving(true);
    try {
      await deleteProject(id);
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-2">Projects</h2>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold text-white mb-2">Projects</h2>
      <p className="text-sm text-gray-400 mb-4">
        Define projects to automatically group conversations by working
        directory. Sessions in matching directories will be tagged with the
        project name.
      </p>

      {error && (
        <div className="mb-4 p-2 bg-red-900/30 border border-red-600/30 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Project list */}
      <div className="space-y-2 mb-4">
        {projects.length === 0 ? (
          <div className="text-gray-500 text-sm p-3 bg-gray-700/30 rounded">
            No projects defined. Add one to start grouping sessions.
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`p-3 rounded border ${
                editingId === project.id
                  ? "bg-blue-900/20 border-blue-600/30"
                  : "bg-gray-700/50 border-gray-600/30"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">
                      {project.name}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                      {project.id}
                    </span>
                  </div>
                  {project.description && (
                    <p className="text-xs text-gray-400 mt-1">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {project.paths.map((path, i) => (
                      <div key={i} className="text-xs text-cyan-400 font-mono">
                        {path}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => startEditing(project)}
                    disabled={saving}
                    className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    disabled={saving}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit form */}
      {(showAddForm || editingId) && (
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-gray-700/30 rounded border border-gray-600/30 space-y-3"
        >
          <div className="text-sm font-medium text-white mb-2">
            {editingId ? "Edit Project" : "Add Project"}
          </div>

          {!editingId && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                ID (slug)
              </label>
              <input
                type="text"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="my-project"
                required
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="My Project"
              required
              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Paths (one per line)
            </label>
            <textarea
              value={formPaths}
              onChange={(e) => setFormPaths(e.target.value)}
              placeholder="~/Documents/my-project&#10;~/work/my-project"
              required
              rows={3}
              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use ~ for home directory. Subdirectories are automatically
              included.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Brief description"
              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Add button */}
      {!showAddForm && !editingId && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full px-3 py-2 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600 border border-gray-600 border-dashed"
        >
          + Add Project
        </button>
      )}

      <p className="text-xs text-gray-500 mt-3">
        Stored in:{" "}
        <code className="bg-gray-700 px-1 rounded">
          ~/.config/agentwatch/config.toml
        </code>
      </p>
    </div>
  );
}

// Redaction Profiles Section
function RedactionProfilesSection() {
  const [profiles, setProfiles] = useState<
    {
      id: string;
      name: string;
      description?: string;
      keptFields: string[];
      isDefault?: boolean;
      createdAt?: string;
    }[]
  >([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("moderate");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

  // Built-in profiles (order: most permissive → most restrictive)
  const builtinProfiles = [
    {
      id: "full-content",
      name: "All",
      description:
        "Includes all fields including file contents. Review carefully before sharing.",
      keptFields: ["*"]
    },
    {
      id: "moderate",
      name: "Moderate",
      description:
        "General audience default. Keeps tool usage patterns and token metrics, but strips all content.",
      keptFields: [
        "session",
        "session.session_id",
        "session.start_time",
        "session.end_time",
        "session.permission_mode",
        "session.source",
        "session.tool_count",
        "session.tools_used",
        "session.total_input_tokens",
        "session.total_output_tokens",
        "session.estimated_cost_usd",
        "tool_usages",
        "tool_usages[].tool_use_id",
        "tool_usages[].tool_name",
        "tool_usages[].timestamp",
        "tool_usages[].session_id",
        "tool_usages[].success",
        "tool_usages[].duration_ms",
        "messages",
        "messages[].uuid",
        "messages[].role",
        "messages[].timestamp",
        "messages[].parentUuid",
        "messages[].message.role",
        "messages[].message.model",
        "messages[].message.usage",
        "messages[].message.stop_reason",
        "type",
        "total_input_tokens",
        "total_output_tokens"
      ],
      isDefault: true
    },
    {
      id: "metadata-only",
      name: "Minimal",
      description:
        "Only session-level statistics. No tool details, no messages.",
      keptFields: [
        "session",
        "session.session_id",
        "session.start_time",
        "session.end_time",
        "session.tool_count",
        "session.tools_used",
        "session.total_input_tokens",
        "session.total_output_tokens",
        "session.estimated_cost_usd",
        "total_input_tokens",
        "total_output_tokens"
      ]
    }
  ];

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/contrib/settings");
      if (!response.ok) throw new Error("Failed to load settings");
      const data = await response.json();
      setProfiles(data.redactionProfiles || []);
      setActiveProfileId(data.activeProfileId || "moderate");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (profileId: string) => {
    try {
      await fetch("/api/contrib/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProfileId: profileId })
      });
      setActiveProfileId(profileId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set default");
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm("Delete this profile?")) return;
    try {
      const newProfiles = profiles.filter((p) => p.id !== profileId);
      await fetch("/api/contrib/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redactionProfiles: newProfiles })
      });
      setProfiles(newProfiles);
      if (activeProfileId === profileId) {
        setActiveProfileId("moderate");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete profile");
    }
  };

  const allProfiles = [...builtinProfiles, ...profiles];
  const isBuiltin = (id: string) => builtinProfiles.some((p) => p.id === id);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Redaction Profiles
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Configure which fields to include when preparing data for sharing.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500">
          Loading profiles...
        </div>
      ) : (
        <div className="space-y-2">
          {allProfiles.map((profile) => (
            <div
              key={profile.id}
              className={`border rounded overflow-hidden ${
                activeProfileId === profile.id
                  ? "border-blue-600 bg-blue-900/20"
                  : "border-gray-700 bg-gray-900/50"
              }`}
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-700/30"
                onClick={() =>
                  setExpandedProfile(
                    expandedProfile === profile.id ? null : profile.id
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-300 font-medium">
                    {profile.name}
                  </span>
                  {activeProfileId === profile.id && (
                    <span className="px-2 py-0.5 text-xs bg-blue-600 rounded text-white">
                      Default
                    </span>
                  )}
                  {isBuiltin(profile.id) && (
                    <span className="px-2 py-0.5 text-xs bg-gray-600 rounded text-gray-400">
                      Built-in
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeProfileId !== profile.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefault(profile.id);
                      }}
                      className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                    >
                      Set Default
                    </button>
                  )}
                  {!isBuiltin(profile.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProfile(profile.id);
                      }}
                      className="px-2 py-1 text-xs bg-red-900/50 text-red-300 rounded hover:bg-red-800/50"
                    >
                      Delete
                    </button>
                  )}
                  <span className="text-gray-500">
                    {expandedProfile === profile.id ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {expandedProfile === profile.id && (
                <div className="p-3 border-t border-gray-700 bg-gray-900/50">
                  <p className="text-sm text-gray-400 mb-3">
                    {profile.description}
                  </p>
                  <div className="text-xs text-gray-500 mb-2">
                    Fields included:{" "}
                    {profile.keptFields.includes("*")
                      ? "All"
                      : profile.keptFields.length}
                  </div>
                  {!profile.keptFields.includes("*") && (
                    <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                      {profile.keptFields.map((field) => (
                        <span
                          key={field}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded font-mono"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-xs text-gray-500">
          Profiles control which fields are kept when preparing sessions for
          sharing. Create custom profiles in the Review/Share tab by configuring
          fields and clicking "Save".
        </p>
      </div>
    </div>
  );
}

// Hook Enhancements Section
function HookEnhancementsSection() {
  const [config, setConfig] = useState<HookEnhancementsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHookEnhancements();
      setConfig(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load hook enhancements config"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (section: string, key: string, value: unknown) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await updateHookEnhancements({
        [section]: { [key]: value }
      });
      if (result.status === "ok") {
        setSaveMessage(`Updated: ${result.updates.join(", ")}`);
        await loadConfig();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">
          Hook Enhancements
        </h2>
        <div className="text-center py-4 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">
          Hook Enhancements
        </h2>
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
        <button
          onClick={() => loadConfig()}
          className="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!config) return null;

  // Apply a preset configuration for trying out a feature
  const applyPreset = async (presetConfig: Record<string, unknown>) => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await updateHookEnhancements(presetConfig);
      if (result.status === "ok") {
        setSaveMessage(`Applied preset: ${result.updates.join(", ")}`);
        await loadConfig();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply preset");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const sections = [
    {
      id: "cost_controls",
      name: "Token Controls",
      description: "Set token limits and budget alerts",
      icon: "🧮",
      isEnabled: config.cost_controls.enabled,
      wip: true,
      wipNote:
        "Currently only works for API users (pay-per-token). Subscription users have unlimited usage. Real-time tracking coming soon.",
      whyUseful:
        "Prevent runaway usage by setting token budgets per session, day, or month. USD is shown as a rough estimate so you can review before continuing.",
      tryItPreset: {
        cost_controls: {
          enabled: true,
          daily_budget_usd: 10,
          over_budget_action: "warn"
        }
      },
      tryItLabel: "Daily token budget preset",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Enable Token Controls</div>
              <div className="text-xs text-gray-500">
                Track and limit token usage
              </div>
            </div>
            <button
              onClick={() =>
                handleUpdate(
                  "cost_controls",
                  "enabled",
                  !config.cost_controls.enabled
                )
              }
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.cost_controls.enabled ? "bg-blue-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.cost_controls.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div
            className={`space-y-3 ${!config.cost_controls.enabled ? "opacity-50" : ""}`}
          >
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Session Token Budget{" "}
                  <span className="text-[10px] text-gray-500">
                    (token-based USD estimate)
                  </span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={config.cost_controls.session_budget_usd ?? ""}
                  onChange={(e) =>
                    handleUpdate(
                      "cost_controls",
                      "session_budget_usd",
                      e.target.value ? Number.parseFloat(e.target.value) : null
                    )
                  }
                  disabled={saving || !config.cost_controls.enabled}
                  className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 disabled:opacity-50"
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Daily Token Budget{" "}
                  <span className="text-[10px] text-gray-500">
                    (token-based USD estimate)
                  </span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={config.cost_controls.daily_budget_usd ?? ""}
                  onChange={(e) =>
                    handleUpdate(
                      "cost_controls",
                      "daily_budget_usd",
                      e.target.value ? Number.parseFloat(e.target.value) : null
                    )
                  }
                  disabled={saving || !config.cost_controls.enabled}
                  className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 disabled:opacity-50"
                  placeholder="No limit"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Monthly Token Budget{" "}
                  <span className="text-[10px] text-gray-500">
                    (token-based USD estimate)
                  </span>
                </label>
                <input
                  type="number"
                  step="10"
                  min="0"
                  value={config.cost_controls.monthly_budget_usd ?? ""}
                  onChange={(e) =>
                    handleUpdate(
                      "cost_controls",
                      "monthly_budget_usd",
                      e.target.value ? Number.parseFloat(e.target.value) : null
                    )
                  }
                  disabled={saving || !config.cost_controls.enabled}
                  className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 disabled:opacity-50"
                  placeholder="No limit"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Over Budget Action
              </label>
              <select
                value={config.cost_controls.over_budget_action}
                onChange={(e) =>
                  handleUpdate(
                    "cost_controls",
                    "over_budget_action",
                    e.target.value
                  )
                }
                disabled={saving || !config.cost_controls.enabled}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 disabled:opacity-50"
              >
                <option value="warn">Warn (show notification)</option>
                <option value="notify">Notify (desktop alert)</option>
                <option value="block">Block (stop execution)</option>
              </select>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "rules",
      name: "Custom Rules",
      description: "Rule engine for hook actions",
      icon: "📋",
      isEnabled: config.rules.enabled,
      wip: true,
      wipNote:
        "Most use cases are better served by Claude Code's native permissions in settings.json. Custom rules are useful for complex conditional logic or team-wide policies.",
      whyUseful:
        "Define custom rules to automatically allow, block, or modify tool calls based on patterns. Useful when you need more complex logic than simple allow/deny patterns.",
      tryItPreset: {
        rules: { enabled: true }
      },
      tryItLabel: "Enable rule engine",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Enable Rules Engine</div>
              <div className="text-xs text-gray-500">
                Evaluate custom rules on hook events
              </div>
            </div>
            <button
              onClick={() =>
                handleUpdate("rules", "enabled", !config.rules.enabled)
              }
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.rules.enabled ? "bg-blue-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.rules.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          {config.rules.rules_file && (
            <div className="text-xs text-gray-500">
              Rules file:{" "}
              <code className="bg-gray-700 px-1 rounded">
                {config.rules.rules_file}
              </code>
            </div>
          )}
          <div className="text-xs text-gray-500">
            Rules are defined in{" "}
            <code className="bg-gray-700 px-1 rounded">
              ~/.config/agentwatch/rules.json
            </code>{" "}
            or via the API.
          </div>
        </div>
      )
    },
    {
      id: "stop_blocking",
      name: "Keep Working / Stop Blocking",
      description: "Make Claude keep working until conditions are met",
      icon: "🚀",
      isEnabled: config.stop_blocking.enabled,
      whyUseful:
        'This is the "keep working" feature. When enabled, Claude won\'t stop until tests pass (or other conditions). Catches incomplete work before you context-switch away. Max 3 attempts prevents infinite loops.',
      tryItPreset: {
        stop_blocking: {
          enabled: true,
          require_tests_pass: true
        }
      },
      tryItLabel: "Enable with test requirement",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Enable Keep Working</div>
              <div className="text-xs text-gray-500">
                Prevent Claude from stopping prematurely
              </div>
            </div>
            <button
              onClick={() =>
                handleUpdate(
                  "stop_blocking",
                  "enabled",
                  !config.stop_blocking.enabled
                )
              }
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.stop_blocking.enabled ? "bg-green-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.stop_blocking.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {config.stop_blocking.enabled && (
            <div className="p-2 bg-green-900/20 border border-green-700/30 rounded text-xs text-green-400">
              When Claude tries to stop, it will receive: "Tests must pass
              before stopping. Please run the test suite and ensure all tests
              pass."
            </div>
          )}

          <div
            className={`space-y-2 ${!config.stop_blocking.enabled ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-300">
                  Require tests pass
                </span>
                <div className="text-xs text-gray-500">
                  Block until test gate passes
                </div>
              </div>
              <button
                onClick={() =>
                  handleUpdate(
                    "stop_blocking",
                    "require_tests_pass",
                    !config.stop_blocking.require_tests_pass
                  )
                }
                disabled={saving || !config.stop_blocking.enabled}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  config.stop_blocking.require_tests_pass
                    ? "bg-green-600"
                    : "bg-gray-600"
                } ${saving || !config.stop_blocking.enabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    config.stop_blocking.require_tests_pass
                      ? "translate-x-5"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-300">
                  Require no lint errors
                </span>
                <div className="text-xs text-gray-500">
                  Block until lint passes (not yet implemented)
                </div>
              </div>
              <button
                onClick={() =>
                  handleUpdate(
                    "stop_blocking",
                    "require_no_lint_errors",
                    !config.stop_blocking.require_no_lint_errors
                  )
                }
                disabled={saving || !config.stop_blocking.enabled}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  config.stop_blocking.require_no_lint_errors
                    ? "bg-green-600"
                    : "bg-gray-600"
                } ${saving || !config.stop_blocking.enabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    config.stop_blocking.require_no_lint_errors
                      ? "translate-x-5"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="text-xs text-gray-500 mt-2">
              Max block attempts: {config.stop_blocking.max_block_attempts}{" "}
              (prevents infinite loops)
            </div>
          </div>
        </div>
      )
    },
    {
      id: "auto_permissions",
      name: "Auto Permissions",
      description: "Automatically approve safe operations",
      icon: "✅",
      isEnabled: config.auto_permissions.enabled,
      whyUseful:
        "Skip the permission prompt for read-only operations like file reads, greps, and ls commands. Reduces interruptions while maintaining safety for writes.",
      tryItPreset: {
        auto_permissions: {
          enabled: true,
          auto_approve_read_only: true
        }
      },
      tryItLabel: "Auto-approve reads",
      content: (
        <div className="space-y-3">
          {/* Note about Claude Code settings */}
          <div className="p-2 bg-purple-900/20 border border-purple-700/30 rounded text-xs text-purple-300">
            <strong>Note:</strong> Claude Code's native{" "}
            <code className="bg-gray-700 px-1 rounded">settings.json</code>{" "}
            already supports auto-approving tools via the{" "}
            <code className="bg-gray-700 px-1 rounded">allow</code> list (e.g.,
            adding
            <code className="bg-gray-700 px-1 rounded">Read</code>,{" "}
            <code className="bg-gray-700 px-1 rounded">Glob</code>,
            <code className="bg-gray-700 px-1 rounded">Grep</code>). This
            feature provides an alternative approach using hooks.
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">
                Enable Auto Permissions
              </div>
              <div className="text-xs text-gray-500">
                Auto-approve certain permission requests
              </div>
            </div>
            <button
              onClick={() =>
                handleUpdate(
                  "auto_permissions",
                  "enabled",
                  !config.auto_permissions.enabled
                )
              }
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.auto_permissions.enabled ? "bg-blue-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.auto_permissions.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div
            className={`${!config.auto_permissions.enabled ? "opacity-50" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">
                Auto-approve read-only operations
              </span>
              <button
                onClick={() =>
                  handleUpdate(
                    "auto_permissions",
                    "auto_approve_read_only",
                    !config.auto_permissions.auto_approve_read_only
                  )
                }
                disabled={saving || !config.auto_permissions.enabled}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  config.auto_permissions.auto_approve_read_only
                    ? "bg-green-600"
                    : "bg-gray-600"
                } ${saving || !config.auto_permissions.enabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    config.auto_permissions.auto_approve_read_only
                      ? "translate-x-5"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "llm_evaluation",
      name: "LLM Evaluation",
      description: "Use AI to evaluate hook actions",
      icon: "🤖",
      isEnabled: config.llm_evaluation.enabled,
      wip: true,
      wipNote:
        "Requires API key in environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, or Ollama running locally). Currently experimental.",
      whyUseful:
        'Have a second AI review tool calls before execution. Useful for catching risky operations, enforcing coding standards, or getting a "second opinion" on changes.',
      tryItPreset: {
        llm_evaluation: {
          enabled: true,
          provider: "anthropic",
          model: "claude-3-haiku-20240307"
        }
      },
      tryItLabel: "Enable with Haiku (fast/cheap)",
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Enable LLM Evaluation</div>
              <div className="text-xs text-gray-500">
                Use another LLM to evaluate actions
              </div>
            </div>
            <button
              onClick={() =>
                handleUpdate(
                  "llm_evaluation",
                  "enabled",
                  !config.llm_evaluation.enabled
                )
              }
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.llm_evaluation.enabled ? "bg-blue-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.llm_evaluation.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div
            className={`grid grid-cols-2 gap-3 ${!config.llm_evaluation.enabled ? "opacity-50" : ""}`}
          >
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Provider
              </label>
              <select
                value={config.llm_evaluation.provider}
                onChange={(e) =>
                  handleUpdate("llm_evaluation", "provider", e.target.value)
                }
                disabled={saving || !config.llm_evaluation.enabled}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 disabled:opacity-50"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="ollama">Ollama (local)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Model</label>
              <input
                type="text"
                value={config.llm_evaluation.model}
                onChange={(e) =>
                  handleUpdate("llm_evaluation", "model", e.target.value)
                }
                disabled={saving || !config.llm_evaluation.enabled}
                className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-200 disabled:opacity-50"
                placeholder="claude-3-haiku-20240307"
              />
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">
            Hook Enhancements
          </h2>
          <span className="px-2 py-0.5 text-xs bg-purple-600 rounded text-white">
            Advanced
          </span>
        </div>
        <button
          onClick={loadConfig}
          disabled={saving}
          className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Advanced hook features for token control, rules, and automation.
      </p>

      {error && (
        <div className="mb-4 p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      <Toast message={saveMessage} onDismiss={() => setSaveMessage(null)} />

      {/* Ready features */}
      <div className="space-y-2">
        <div className="text-xs text-green-400 font-medium mb-2">
          Ready to use:
        </div>
        {sections
          .filter((s) => !s.wip)
          .map((section) => (
            <div
              key={section.id}
              className={`bg-gray-700/50 rounded ${section.isEnabled ? "ring-1 ring-green-600/30" : ""}`}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-700/70 rounded"
              >
                <div className="flex items-center gap-2">
                  <span>{section.icon}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-200">
                      {section.name}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                        section.isEnabled
                          ? "bg-green-600/30 text-green-400"
                          : "bg-gray-600/50 text-gray-400"
                      }`}
                    >
                      {section.isEnabled ? "ON" : "OFF"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {section.description}
                    </span>
                  </div>
                </div>
                <span className="text-gray-500">
                  {expandedSections.has(section.id) ? "▼" : "▶"}
                </span>
              </button>

              {expandedSections.has(section.id) && (
                <div className="px-3 pb-3 pt-1 space-y-3">
                  {/* Why useful explanation */}
                  <div className="p-2 bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
                    <strong>Why use this?</strong> {section.whyUseful}
                  </div>

                  {/* Try it button */}
                  <button
                    onClick={() => applyPreset(section.tryItPreset)}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Try it: {section.tryItLabel}
                  </button>

                  {/* Actual controls */}
                  {section.content}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Work in Progress features */}
      <div className="space-y-2 mt-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-xs text-yellow-400 font-medium">
            Work in Progress:
          </div>
          <span className="px-1.5 py-0.5 text-[10px] bg-yellow-600/30 text-yellow-400 rounded">
            Experimental
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-2">
          These features are under development and may not work fully yet.
        </p>
        {sections
          .filter((s) => s.wip)
          .map((section) => (
            <div
              key={section.id}
              className={`bg-gray-700/50 rounded border border-yellow-700/20 ${section.isEnabled ? "ring-1 ring-yellow-600/30" : ""}`}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-700/70 rounded"
              >
                <div className="flex items-center gap-2">
                  <span>{section.icon}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-200">
                      {section.name}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                        section.isEnabled
                          ? "bg-green-600/30 text-green-400"
                          : "bg-gray-600/50 text-gray-400"
                      }`}
                    >
                      {section.isEnabled ? "ON" : "OFF"}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-yellow-600/30 text-yellow-400 rounded">
                      WIP
                    </span>
                    <span className="text-xs text-gray-500">
                      {section.description}
                    </span>
                  </div>
                </div>
                <span className="text-gray-500">
                  {expandedSections.has(section.id) ? "▼" : "▶"}
                </span>
              </button>

              {expandedSections.has(section.id) && (
                <div className="px-3 pb-3 pt-1 space-y-3">
                  {/* WIP warning */}
                  {section.wipNote && (
                    <div className="p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-xs text-yellow-300">
                      <strong>Work in Progress:</strong> {section.wipNote}
                    </div>
                  )}

                  {/* Why useful explanation */}
                  <div className="p-2 bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
                    <strong>Why use this?</strong> {section.whyUseful}
                  </div>

                  {/* Try it button */}
                  <button
                    onClick={() => applyPreset(section.tryItPreset)}
                    disabled={saving}
                    className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Try it: {section.tryItLabel}
                  </button>

                  {/* Actual controls */}
                  {section.content}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

// Raw Config TOML Viewer
function RawConfigViewer() {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadRawConfig();
  }, []);

  const loadRawConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRawConfig();
      setContent(data.content);
      setEditedContent(data.content);
      setPath(data.path);
      setExists(data.exists);
      setHasChanges(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await saveRawConfig(editedContent);
      if (result.success) {
        setContent(editedContent);
        setHasChanges(false);
        setSaveMessage(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  const handleContentChange = (newContent: string) => {
    setEditedContent(newContent);
    setHasChanges(newContent !== content);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-300">Agentwatch Config</span>
        <span className="text-xs text-gray-500">({path})</span>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : error ? (
        <div className="p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      ) : (
        <>
          {!exists && (
            <div className="mb-2 p-2 bg-blue-900/20 border border-blue-800/30 rounded text-xs text-blue-300">
              Config file doesn't exist yet. Edit below and save to create it.
            </div>
          )}

          <textarea
            value={editedContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-64 p-2 bg-gray-900 border border-gray-700 rounded font-mono text-xs text-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder={`# Agentwatch Configuration
# Edit and save to create ~/.config/agentwatch/config.toml

[hook_enhancements.stop_blocking]
enabled = true
require_tests_pass = true
max_block_attempts = 3

[hook_enhancements.cost_controls]
enabled = true
daily_budget_usd = 25.0
over_budget_action = "warn"
`}
          />

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className={`px-3 py-1.5 text-xs rounded ${
                  hasChanges
                    ? "bg-green-600 hover:bg-green-500 text-white"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditedContent(content);
                  setHasChanges(false);
                }}
                disabled={!hasChanges}
                className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Discard
              </button>
              <button
                onClick={loadRawConfig}
                className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                Reload
              </button>
            </div>
            {hasChanges && (
              <span className="text-xs text-yellow-400">Unsaved changes</span>
            )}
          </div>

          <Toast message={saveMessage} onDismiss={() => setSaveMessage(null)} />

          <div className="mt-2 text-xs text-gray-500">
            Changes require daemon restart to take effect. Run:{" "}
            <code className="bg-gray-700 px-1 rounded">aw daemon start</code>
          </div>
        </>
      )}
    </div>
  );
}

// External Reference Section - collapsible section with reference content
function ExternalReferenceSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-white">
            External Reference
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Log format schemas, MCP servers, Claude Code permissions, and token
            calculator
          </p>
        </div>
        <span className="text-gray-400 text-lg">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <ReferencePane />
        </div>
      )}
    </div>
  );
}

// Combined Raw Files Section - shows both TOML and JSON at bottom of page
function RawFilesSection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-400">
            Raw Config Files
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            If you're curious what the config files look like (or need to edit
            them directly)
          </p>
        </div>
        <span className="text-gray-500 text-lg">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-6">
          <RawConfigViewer />
          <RawJsonViewer />
        </div>
      )}
    </div>
  );
}

// Raw JSON Viewer for settings.json
function RawJsonViewer() {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/claude/settings");
      const data = await response.json();
      const rawContent =
        data.raw ?? JSON.stringify(data.settings ?? {}, null, 2);
      setContent(rawContent);
      setEditedContent(rawContent);
      setPath(data.path ?? "~/.claude/settings.json");
      setHasChanges(false);
      setJsonError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const validateJson = (json: string): string | null => {
    try {
      JSON.parse(json);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  };

  const handleContentChange = (newContent: string) => {
    setEditedContent(newContent);
    setHasChanges(newContent !== content);
    setJsonError(validateJson(newContent));
  };

  const handleSave = async () => {
    if (jsonError) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch("/api/claude/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: editedContent })
      });
      const result = await response.json();
      if (result.success) {
        setContent(editedContent);
        setHasChanges(false);
        setSaveMessage("Settings saved successfully");
        setShowConfirm(false);
      } else {
        setError(result.error ?? "Failed to save");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 5000);
    }
  };

  return (
    <div className="border-t border-gray-700 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-300">Claude Code Settings</span>
        <span className="text-xs text-gray-500">({path})</span>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : error ? (
        <div className="p-2 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
        </div>
      ) : (
        <>
          <textarea
            value={editedContent}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-64 p-2 bg-gray-900 border border-gray-700 rounded font-mono text-xs text-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            spellCheck={false}
          />

          {jsonError && (
            <p className="mt-1 text-xs text-red-400">{jsonError}</p>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfirm(true)}
                disabled={saving || !hasChanges || !!jsonError}
                className={`px-3 py-1.5 text-xs rounded ${
                  hasChanges && !jsonError
                    ? "bg-green-600 hover:bg-green-500 text-white"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                } disabled:opacity-50`}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditedContent(content);
                  setHasChanges(false);
                  setJsonError(null);
                }}
                disabled={!hasChanges}
                className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Discard
              </button>
              <button
                onClick={loadSettings}
                className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              >
                Reload
              </button>
            </div>
            {hasChanges && !jsonError && (
              <span className="text-xs text-yellow-400">Unsaved changes</span>
            )}
          </div>

          <Toast message={saveMessage} onDismiss={() => setSaveMessage(null)} />
        </>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Confirm Save
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              This will overwrite your Claude Code settings.json file. Make sure
              your JSON is valid.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Common permission presets
const PERMISSION_PRESETS = [
  {
    id: "permissive",
    name: "Permissive",
    description: "Minimal restrictions for trusted projects",
    color: "green",
    permissions: {
      allow: [
        "Bash(ls:*)",
        "Bash(git:*)",
        "Bash(npm:*)",
        "Bash(bun:*)",
        "Read"
      ],
      deny: ["Bash(rm -rf /)"]
    }
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Standard safety with usability",
    color: "blue",
    permissions: {
      allow: ["Read", "Glob", "Grep"],
      deny: [
        "Bash(curl:*)|sh",
        "Bash(wget:*)|bash",
        "Write(.env*)",
        "Write(~/.ssh/*)"
      ]
    }
  },
  {
    id: "restrictive",
    name: "Restrictive",
    description:
      "More careful defaults—for stronger isolation see Agentwatch Docs (sandboxing, Docker, VPS)",
    color: "red",
    permissions: {
      allow: [],
      deny: [
        "Bash(rm:*)",
        "Bash(curl:*)",
        "Bash(wget:*)",
        "Write(.env*)",
        "Write(~/.ssh/*)",
        "Bash(*|*sh)"
      ]
    }
  }
];

// Common patterns library
const COMMON_PATTERNS = {
  allow: [
    { pattern: "Read", description: "Read any file" },
    { pattern: "Glob", description: "Find files by pattern" },
    { pattern: "Grep", description: "Search file contents" },
    { pattern: "Bash(git:*)", description: "All git commands" },
    { pattern: "Bash(npm:*)", description: "All npm commands" },
    { pattern: "Bash(bun:*)", description: "All bun commands" },
    { pattern: "Bash(ls:*)", description: "List directories" },
    { pattern: "Bash(cat:*)", description: "View file contents" },
    { pattern: "WebFetch", description: "Fetch web content" },
    { pattern: "WebSearch", description: "Search the web" }
  ],
  deny: [
    { pattern: "Bash(rm -rf /)", description: "Delete root filesystem" },
    { pattern: "Bash(rm -rf ~/)", description: "Delete home directory" },
    { pattern: "Write(.env*)", description: "Write to env files" },
    { pattern: "Write(~/.ssh/*)", description: "Modify SSH keys" },
    { pattern: "Write(~/.aws/*)", description: "Modify AWS credentials" },
    { pattern: "Bash(*|*sh)", description: "Pipe to shell" },
    { pattern: "Bash(curl:*)|sh", description: "Curl pipe to shell" },
    { pattern: "Bash(git push --force*)", description: "Force push" },
    { pattern: "Bash(sudo:*)", description: "Sudo commands" }
  ]
};

// Claude Code Settings Section
function ClaudeSettingsSection() {
  const [data, setData] = useState<ClaudeSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [expandedHooks, setExpandedHooks] = useState<Set<string>>(new Set());
  const [newAllowPattern, setNewAllowPattern] = useState("");
  const [newDenyPattern, setNewDenyPattern] = useState("");
  const [activeSection, setActiveSection] = useState<
    "permissions" | "sandbox" | "env" | "ui" | "hooks"
  >("permissions");
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchClaudeSettings();
      setData(result);
      setRawJson(result.raw ?? JSON.stringify(result.settings ?? {}, null, 2));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load Claude settings"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRaw = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const result = await replaceClaudeSettings(rawJson);
      if (result.success) {
        setSaveMessage("Settings saved successfully");
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to save settings");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
      setShowConfirm(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleRemoveHook = async (hookType: string, index: number) => {
    if (!data?.settings?.hooks) return;
    const hooks =
      data.settings.hooks[hookType as keyof typeof data.settings.hooks] ?? [];
    const newHooks = hooks.filter((_, i) => i !== index);

    setSaving(true);
    try {
      const result = await updateClaudeSettings({
        hooks: { [hookType]: newHooks }
      });
      if (result.success) {
        setSaveMessage(`Removed hook from ${hookType}`);
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to remove hook");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove hook");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleRemovePermission = async (
    type: "allow" | "deny",
    index: number
  ) => {
    if (!data?.settings?.permissions) return;
    const patterns = data.settings.permissions[type] ?? [];
    const newPatterns = patterns.filter((_, i) => i !== index);

    setSaving(true);
    try {
      const result = await updateClaudeSettings({
        permissions: { [type]: newPatterns }
      });
      if (result.success) {
        setSaveMessage(`Removed ${type} pattern`);
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to remove pattern");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove pattern");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleAddPermission = async (
    type: "allow" | "deny",
    pattern: string
  ) => {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) return;

    const currentPatterns = data?.settings?.permissions?.[type] ?? [];
    // Prevent duplicates
    if (currentPatterns.includes(trimmedPattern)) {
      setError(`Pattern "${trimmedPattern}" already exists in ${type} list`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    setSaving(true);
    try {
      const result = await updateClaudeSettings({
        permissions: { [type]: [...currentPatterns, trimmedPattern] }
      });
      if (result.success) {
        setSaveMessage(`Added ${type} pattern: ${trimmedPattern}`);
        // Clear the input
        if (type === "allow") {
          setNewAllowPattern("");
        } else {
          setNewDenyPattern("");
        }
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to add pattern");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add pattern");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Apply a permission preset
  const handleApplyPreset = async (preset: (typeof PERMISSION_PRESETS)[0]) => {
    setSaving(true);
    try {
      const result = await updateClaudeSettings({
        permissions: preset.permissions
      });
      if (result.success) {
        setSaveMessage(`Applied "${preset.name}" preset`);
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to apply preset");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply preset");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Update sandbox settings
  const handleUpdateSandbox = async (
    update: Partial<NonNullable<ClaudeSettings["sandbox"]>>
  ) => {
    setSaving(true);
    try {
      const currentSandbox = data?.settings?.sandbox ?? {};
      const result = await updateClaudeSettings({
        sandbox: { ...currentSandbox, ...update }
      });
      if (result.success) {
        setSaveMessage("Sandbox settings updated");
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to update sandbox");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update sandbox");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Add/remove network domain
  const handleAddDomain = async (domain: string) => {
    const trimmed = domain.trim();
    if (!trimmed) return;

    const currentDomains =
      data?.settings?.sandbox?.network?.allowedDomains ?? [];
    if (currentDomains.includes(trimmed)) {
      setError("Domain already exists");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setSaving(true);
    try {
      const result = await updateClaudeSettings({
        sandbox: {
          ...data?.settings?.sandbox,
          network: {
            ...data?.settings?.sandbox?.network,
            allowedDomains: [...currentDomains, trimmed]
          }
        }
      });
      if (result.success) {
        setSaveMessage(`Added domain: ${trimmed}`);
        setNewDomain("");
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to add domain");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    const currentDomains =
      data?.settings?.sandbox?.network?.allowedDomains ?? [];
    setSaving(true);
    try {
      const result = await updateClaudeSettings({
        sandbox: {
          ...data?.settings?.sandbox,
          network: {
            ...data?.settings?.sandbox?.network,
            allowedDomains: currentDomains.filter((d) => d !== domain)
          }
        }
      });
      if (result.success) {
        setSaveMessage(`Removed domain: ${domain}`);
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to remove domain");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove domain");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // Environment variable management
  const handleAddEnvVar = async (key: string, value: string) => {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey) return;

    setSaving(true);
    try {
      const currentEnv = data?.settings?.env ?? {};
      const result = await updateClaudeSettings({
        env: { ...currentEnv, [trimmedKey]: trimmedValue }
      });
      if (result.success) {
        setSaveMessage(`Set ${trimmedKey}`);
        setNewEnvKey("");
        setNewEnvValue("");
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to add env var");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add env var");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleRemoveEnvVar = async (key: string) => {
    setSaving(true);
    try {
      const currentEnv = { ...(data?.settings?.env ?? {}) };
      delete currentEnv[key];
      const result = await updateClaudeSettings({ env: currentEnv });
      if (result.success) {
        setSaveMessage(`Removed ${key}`);
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to remove env var");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove env var");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // UI settings
  const handleUpdateUISetting = async (key: string, value: unknown) => {
    setSaving(true);
    try {
      const result = await updateClaudeSettings({ [key]: value });
      if (result.success) {
        setSaveMessage(`Updated ${key}`);
        await loadSettings();
      } else {
        setError(result.error ?? "Failed to update setting");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update setting");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const toggleHookExpanded = (hookType: string) => {
    setExpandedHooks((prev) => {
      const next = new Set(prev);
      if (next.has(hookType)) {
        next.delete(hookType);
      } else {
        next.add(hookType);
      }
      return next;
    });
  };

  // Check if a hook group contains agentwatch hooks
  const isAgentwatchHookGroup = (group: ClaudeSettingsHookGroup): boolean => {
    return (
      group.hooks?.some(
        (hook) =>
          hook.command?.includes("/api/hooks/") ||
          hook.command?.includes("agentwatch") ||
          hook.command?.includes(".agentwatch") ||
          hook.command?.includes(":8420")
      ) ?? false
    );
  };

  // Count hooks by type (total individual hooks across all groups)
  const hookCounts = useMemo(() => {
    if (!data?.settings?.hooks) return {};
    const counts: Record<string, number> = {};
    for (const [type, groups] of Object.entries(data.settings.hooks)) {
      if (Array.isArray(groups)) {
        // Count total individual hooks across all groups
        counts[type] = groups.reduce((sum, group) => {
          const grp = group as ClaudeSettingsHookGroup;
          return sum + (grp.hooks?.length ?? 0);
        }, 0);
      }
    }
    return counts;
  }, [data?.settings?.hooks]);

  // All Claude Code hook types - see https://code.claude.com/docs/en/hooks.md
  const HOOK_TYPES = [
    "PreToolUse", // Before tool executes (can block/modify)
    "PostToolUse", // After tool completes
    "PermissionRequest", // When permission dialog shown (can auto-approve/deny)
    "UserPromptSubmit", // When user submits prompt (can validate/block)
    "Notification", // Claude sends notification
    "SessionStart", // Session begins/resumes
    "SessionEnd", // Session terminates
    "Stop", // Claude finishes responding (can force continue)
    "SubagentStop", // Subagent finishes
    "PreCompact" // Before context compaction
  ];

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-white mb-4">
          Claude Code Settings
        </h2>
        <div className="text-center py-8 text-gray-500">
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              Claude Code Settings
            </h2>
            <span className="px-2 py-0.5 text-xs bg-blue-600 rounded text-white">
              Interactive
            </span>
          </div>
          <p className="text-xs text-gray-500 font-mono mt-1">{data?.path}</p>
          <div className="mt-2 p-2 bg-blue-900/20 border border-blue-800/30 rounded">
            <p className="text-xs text-blue-300">
              This is a visual editor for your Claude Code{" "}
              <code className="bg-gray-700 px-1 rounded">settings.json</code>{" "}
              file. You can also edit these settings directly from Claude Code
              using{" "}
              <code className="bg-gray-700 px-1 rounded">/permissions</code> or
              by editing the file manually.
            </p>
          </div>
        </div>
        <button
          onClick={loadSettings}
          disabled={saving}
          className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      <Toast message={saveMessage} onDismiss={() => setSaveMessage(null)} />

      {!data?.exists && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-400 text-sm">
          <p className="font-medium mb-2">No settings file found</p>
          <p className="text-xs">
            The file will be created when you save settings.
          </p>
        </div>
      )}

      {data?.error && !data?.settings && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded text-red-400 text-sm">
          <p className="font-medium mb-2">Invalid JSON in settings file</p>
          <p className="text-xs mb-2">{data.error}</p>
          <p className="text-xs">
            Use the raw JSON editor at the bottom of this page to view and fix
            the content.
          </p>
        </div>
      )}

      {/* Structured View with section tabs */}
      <div className="space-y-4">
        {/* Section Tabs */}
        <div className="flex gap-1 border-b border-gray-700 pb-2">
          {(["permissions", "sandbox", "env", "ui", "hooks"] as const).map(
            (section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`px-3 py-1.5 text-xs rounded-t ${
                  activeSection === section
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-300 hover:bg-gray-800"
                }`}
              >
                {section === "permissions" && "Permissions"}
                {section === "sandbox" && "Sandbox"}
                {section === "env" && "Environment"}
                {section === "ui" && "UI & Model"}
                {section === "hooks" && "Hooks"}
              </button>
            )
          )}
        </div>

        {/* Permissions Section */}
        {activeSection === "permissions" && (
          <div className="space-y-4">
            {/* Presets - collapsed by default */}
            <details className="group">
              <summary className="flex items-center gap-2 mb-2 cursor-pointer list-none">
                <span className="text-gray-500 text-xs group-open:rotate-90 transition-transform">
                  ▶
                </span>
                <h3 className="text-sm font-medium text-white">
                  Quick Presets
                </h3>
                <span className="text-xs text-yellow-500">
                  (replaces existing allow/deny lists)
                </span>
              </summary>
              <div className="space-y-2">
                {PERMISSION_PRESETS.map((preset) => (
                  <div
                    key={preset.id}
                    className={`rounded border transition-colors ${
                      preset.color === "green"
                        ? "border-green-700"
                        : preset.color === "blue"
                          ? "border-blue-700"
                          : "border-red-700"
                    }`}
                  >
                    <div className="flex items-center justify-between p-3">
                      <button
                        onClick={() =>
                          setExpandedPreset(
                            expandedPreset === preset.id ? null : preset.id
                          )
                        }
                        className="flex items-center gap-2 text-left flex-1"
                      >
                        <span className="text-gray-500 text-xs">
                          {expandedPreset === preset.id ? "▼" : "▶"}
                        </span>
                        <div>
                          <div
                            className={`text-sm font-medium ${
                              preset.color === "green"
                                ? "text-green-400"
                                : preset.color === "blue"
                                  ? "text-blue-400"
                                  : "text-red-400"
                            }`}
                          >
                            {preset.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {preset.description}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => handleApplyPreset(preset)}
                        disabled={saving}
                        className={`px-3 py-1.5 text-xs rounded ${
                          preset.color === "green"
                            ? "bg-green-700 hover:bg-green-600 text-green-100"
                            : preset.color === "blue"
                              ? "bg-blue-700 hover:bg-blue-600 text-blue-100"
                              : "bg-red-700 hover:bg-red-600 text-red-100"
                        } disabled:opacity-50`}
                      >
                        Apply
                      </button>
                    </div>
                    {expandedPreset === preset.id && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-700 bg-gray-900/30">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-xs text-green-400 font-medium mb-1">
                              Allow patterns:
                            </div>
                            {preset.permissions.allow.length === 0 ? (
                              <div className="text-xs text-gray-500 italic">
                                None (all blocked by default)
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                {preset.permissions.allow.map((p, i) => (
                                  <div
                                    key={i}
                                    className="text-xs font-mono text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded"
                                  >
                                    {p}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-red-400 font-medium mb-1">
                              Deny patterns:
                            </div>
                            {preset.permissions.deny.length === 0 ? (
                              <div className="text-xs text-gray-500 italic">
                                None
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                {preset.permissions.deny.map((p, i) => (
                                  <div
                                    key={i}
                                    className="text-xs font-mono text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded"
                                  >
                                    {p}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            {/* Allow/Deny patterns */}
            <div className="grid grid-cols-2 gap-4">
              {/* Allow patterns */}
              <div className="bg-gray-700/50 rounded p-3">
                <h4 className="text-xs font-medium text-green-400 mb-2">
                  Allow ({(data?.settings?.permissions?.allow ?? []).length})
                </h4>
                {/* Quick add dropdown */}
                <div className="mb-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value)
                        handleAddPermission("allow", e.target.value);
                      e.target.value = "";
                    }}
                    disabled={saving}
                    className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 focus:outline-none focus:border-green-500"
                  >
                    <option value="">+ Add common pattern...</option>
                    {COMMON_PATTERNS.allow
                      .filter(
                        (p) =>
                          !(data?.settings?.permissions?.allow ?? []).includes(
                            p.pattern
                          )
                      )
                      .map((p) => (
                        <option key={p.pattern} value={p.pattern}>
                          {p.pattern} - {p.description}
                        </option>
                      ))}
                  </select>
                </div>
                {/* Custom input */}
                <div className="flex gap-1 mb-2">
                  <input
                    type="text"
                    value={newAllowPattern}
                    onChange={(e) => setNewAllowPattern(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      handleAddPermission("allow", newAllowPattern)
                    }
                    placeholder="Custom pattern..."
                    className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-green-500"
                    disabled={saving}
                  />
                  <button
                    onClick={() =>
                      handleAddPermission("allow", newAllowPattern)
                    }
                    disabled={saving || !newAllowPattern.trim()}
                    className="px-2 py-1 text-xs bg-green-700 text-green-200 rounded hover:bg-green-600 disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(data?.settings?.permissions?.allow ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500 italic">
                      No allow patterns
                    </p>
                  ) : (
                    (data?.settings?.permissions?.allow ?? []).map(
                      (pattern, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-gray-800 rounded px-2 py-1"
                        >
                          <span className="text-xs font-mono text-gray-300 truncate">
                            {pattern}
                          </span>
                          <button
                            onClick={() => handleRemovePermission("allow", idx)}
                            disabled={saving}
                            className="ml-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            ×
                          </button>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>

              {/* Deny patterns */}
              <div className="bg-gray-700/50 rounded p-3">
                <h4 className="text-xs font-medium text-red-400 mb-2">
                  Deny ({(data?.settings?.permissions?.deny ?? []).length})
                </h4>
                {/* Quick add dropdown */}
                <div className="mb-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value)
                        handleAddPermission("deny", e.target.value);
                      e.target.value = "";
                    }}
                    disabled={saving}
                    className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 focus:outline-none focus:border-red-500"
                  >
                    <option value="">+ Add common pattern...</option>
                    {COMMON_PATTERNS.deny
                      .filter(
                        (p) =>
                          !(data?.settings?.permissions?.deny ?? []).includes(
                            p.pattern
                          )
                      )
                      .map((p) => (
                        <option key={p.pattern} value={p.pattern}>
                          {p.pattern} - {p.description}
                        </option>
                      ))}
                  </select>
                </div>
                {/* Custom input */}
                <div className="flex gap-1 mb-2">
                  <input
                    type="text"
                    value={newDenyPattern}
                    onChange={(e) => setNewDenyPattern(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      handleAddPermission("deny", newDenyPattern)
                    }
                    placeholder="Custom pattern..."
                    className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500"
                    disabled={saving}
                  />
                  <button
                    onClick={() => handleAddPermission("deny", newDenyPattern)}
                    disabled={saving || !newDenyPattern.trim()}
                    className="px-2 py-1 text-xs bg-red-700 text-red-200 rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(data?.settings?.permissions?.deny ?? []).length === 0 ? (
                    <p className="text-xs text-gray-500 italic">
                      No deny patterns
                    </p>
                  ) : (
                    (data?.settings?.permissions?.deny ?? []).map(
                      (pattern, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-gray-800 rounded px-2 py-1"
                        >
                          <span className="text-xs font-mono text-gray-300 truncate">
                            {pattern}
                          </span>
                          <button
                            onClick={() => handleRemovePermission("deny", idx)}
                            disabled={saving}
                            className="ml-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                          >
                            ×
                          </button>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Patterns:{" "}
              <code className="bg-gray-700 px-1 rounded">Tool(arg:value)</code>{" "}
              ·
              <a
                href="https://docs.anthropic.com/en/docs/claude-code/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline ml-1"
              >
                Syntax docs
              </a>
            </p>
          </div>
        )}

        {/* Sandbox Section */}
        {activeSection === "sandbox" && (
          <div className="space-y-4">
            <div className="bg-gray-700/50 rounded p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                macOS Sandbox
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-200">Enable Sandbox</div>
                    <div className="text-xs text-gray-500">
                      Restrict filesystem and network access
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleUpdateSandbox({
                        enabled: !data?.settings?.sandbox?.enabled
                      })
                    }
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      data?.settings?.sandbox?.enabled
                        ? "bg-blue-600"
                        : "bg-gray-600"
                    } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        data?.settings?.sandbox?.enabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-200">
                      Auto-allow Bash if sandboxed
                    </div>
                    <div className="text-xs text-gray-500">
                      Skip permission prompts when sandbox is active
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleUpdateSandbox({
                        autoAllowBashIfSandboxed:
                          !data?.settings?.sandbox?.autoAllowBashIfSandboxed
                      })
                    }
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      data?.settings?.sandbox?.autoAllowBashIfSandboxed
                        ? "bg-blue-600"
                        : "bg-gray-600"
                    } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        data?.settings?.sandbox?.autoAllowBashIfSandboxed
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gray-700/50 rounded p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                Network Allowlist
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Domains Claude can access when sandboxed
              </p>

              <div className="flex gap-1 mb-3">
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleAddDomain(newDomain)
                  }
                  placeholder="e.g., api.github.com"
                  className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  disabled={saving}
                />
                <button
                  onClick={() => handleAddDomain(newDomain)}
                  disabled={saving || !newDomain.trim()}
                  className="px-3 py-1 text-xs bg-blue-700 text-blue-200 rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  Add
                </button>
              </div>

              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(data?.settings?.sandbox?.network?.allowedDomains ?? [])
                  .length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    No domains configured
                  </p>
                ) : (
                  (data?.settings?.sandbox?.network?.allowedDomains ?? []).map(
                    (domain) => (
                      <div
                        key={domain}
                        className="flex items-center justify-between bg-gray-800 rounded px-2 py-1"
                      >
                        <span className="text-xs font-mono text-gray-300">
                          {domain}
                        </span>
                        <button
                          onClick={() => handleRemoveDomain(domain)}
                          disabled={saving}
                          className="text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          ×
                        </button>
                      </div>
                    )
                  )
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-200">
                    Allow local binding
                  </div>
                  <div className="text-xs text-gray-500">
                    Allow localhost server creation
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleUpdateSandbox({
                      network: {
                        ...data?.settings?.sandbox?.network,
                        allowLocalBinding:
                          !data?.settings?.sandbox?.network?.allowLocalBinding
                      }
                    })
                  }
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    data?.settings?.sandbox?.network?.allowLocalBinding
                      ? "bg-blue-600"
                      : "bg-gray-600"
                  } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      data?.settings?.sandbox?.network?.allowLocalBinding
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Environment Variables Section */}
        {activeSection === "env" && (
          <div className="space-y-4">
            <div className="bg-gray-700/50 rounded p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                Environment Variables
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Set environment variables for all Claude Code sessions
              </p>

              <div className="flex gap-1 mb-3">
                <input
                  type="text"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  placeholder="KEY"
                  className="w-1/3 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                  disabled={saving}
                />
                <input
                  type="text"
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleAddEnvVar(newEnvKey, newEnvValue)
                  }
                  placeholder="value"
                  className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  disabled={saving}
                />
                <button
                  onClick={() => handleAddEnvVar(newEnvKey, newEnvValue)}
                  disabled={saving || !newEnvKey.trim()}
                  className="px-3 py-1 text-xs bg-blue-700 text-blue-200 rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  Set
                </button>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {Object.keys(data?.settings?.env ?? {}).length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    No environment variables configured
                  </p>
                ) : (
                  Object.entries(data?.settings?.env ?? {}).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between bg-gray-800 rounded px-2 py-1"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono text-blue-400">
                            {key}
                          </span>
                          <span className="text-xs text-gray-500 mx-1">=</span>
                          <span className="text-xs font-mono text-gray-300 truncate">
                            {key.toLowerCase().includes("key") ||
                            key.toLowerCase().includes("token") ||
                            key.toLowerCase().includes("secret")
                              ? "••••••••"
                              : value}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveEnvVar(key)}
                          disabled={saving}
                          className="ml-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          ×
                        </button>
                      </div>
                    )
                  )
                )}
              </div>

              <div className="mt-4 p-2 bg-gray-800 rounded text-xs text-gray-500">
                <div className="font-medium text-gray-400 mb-1">
                  Common variables:
                </div>
                <code className="text-blue-400">ANTHROPIC_MODEL</code> - Default
                model
                <br />
                <code className="text-blue-400">
                  CLAUDE_CODE_MAX_OUTPUT_TOKENS
                </code>{" "}
                - Max output tokens
                <br />
                <code className="text-blue-400">CLAUDE_CODE_USE_BEDROCK</code> -
                Use AWS Bedrock
              </div>
            </div>
          </div>
        )}

        {/* UI & Model Settings Section */}
        {activeSection === "ui" && (
          <div className="space-y-4">
            <div className="bg-gray-700/50 rounded p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                UI Preferences
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-200">Spinner Tips</div>
                    <div className="text-xs text-gray-500">
                      Show tips during loading animations
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleUpdateUISetting(
                        "spinnerTipsEnabled",
                        !(data?.settings as Record<string, unknown>)
                          ?.spinnerTipsEnabled
                      )
                    }
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (data?.settings as Record<string, unknown>)
                        ?.spinnerTipsEnabled !== false
                        ? "bg-blue-600"
                        : "bg-gray-600"
                    } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (data?.settings as Record<string, unknown>)
                          ?.spinnerTipsEnabled !== false
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-gray-700/50 rounded p-4">
              <h3 className="text-sm font-medium text-white mb-3">
                Git Attribution
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-200">Commits</div>
                    <div className="text-xs text-gray-500">
                      Add Claude byline to git commits
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const currentAttribution =
                        ((data?.settings as Record<string, unknown>)
                          ?.attribution as
                          | Record<string, boolean>
                          | undefined) ?? {};
                      handleUpdateUISetting("attribution", {
                        ...currentAttribution,
                        commits: !currentAttribution.commits
                      });
                    }}
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (
                        (data?.settings as Record<string, unknown>)
                          ?.attribution as Record<string, boolean>
                      )?.commits !== false
                        ? "bg-blue-600"
                        : "bg-gray-600"
                    } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (
                          (data?.settings as Record<string, unknown>)
                            ?.attribution as Record<string, boolean>
                        )?.commits !== false
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-200">Pull Requests</div>
                    <div className="text-xs text-gray-500">
                      Add Claude byline to PRs
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const currentAttribution =
                        ((data?.settings as Record<string, unknown>)
                          ?.attribution as
                          | Record<string, boolean>
                          | undefined) ?? {};
                      handleUpdateUISetting("attribution", {
                        ...currentAttribution,
                        pullRequests: !currentAttribution.pullRequests
                      });
                    }}
                    disabled={saving}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      (
                        (data?.settings as Record<string, unknown>)
                          ?.attribution as Record<string, boolean>
                      )?.pullRequests !== false
                        ? "bg-blue-600"
                        : "bg-gray-600"
                    } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        (
                          (data?.settings as Record<string, unknown>)
                            ?.attribution as Record<string, boolean>
                        )?.pullRequests !== false
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Other Settings Preview */}
            {data?.settings &&
              Object.keys(data.settings).filter(
                (k) =>
                  ![
                    "hooks",
                    "permissions",
                    "sandbox",
                    "env",
                    "spinnerTipsEnabled",
                    "attribution"
                  ].includes(k)
              ).length > 0 && (
                <div className="bg-gray-700/50 rounded p-4">
                  <h3 className="text-sm font-medium text-white mb-3">
                    Other Settings
                  </h3>
                  <pre className="text-xs font-mono text-gray-400 overflow-x-auto">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(data.settings).filter(
                          ([k]) =>
                            ![
                              "hooks",
                              "permissions",
                              "sandbox",
                              "env",
                              "spinnerTipsEnabled",
                              "attribution"
                            ].includes(k)
                        )
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
          </div>
        )}

        {/* Hooks Section */}
        {activeSection === "hooks" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">Hooks</h3>
              <div className="flex items-center gap-2 text-xs">
                <a
                  href="https://docs.anthropic.com/en/docs/claude-code/hooks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Claude Code Hooks Docs
                </a>
                <span className="text-gray-600">|</span>
                <span
                  className="text-gray-500"
                  title="Last synced with Claude Code hooks documentation"
                >
                  Synced: 2025-01-15
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {HOOK_TYPES.map((hookType) => {
                const hooks =
                  data?.settings?.hooks?.[
                    hookType as keyof NonNullable<ClaudeSettings["hooks"]>
                  ] ?? [];
                const count = hookCounts[hookType] ?? 0;
                const isExpanded = expandedHooks.has(hookType);

                return (
                  <div key={hookType} className="bg-gray-700/50 rounded">
                    <button
                      onClick={() => toggleHookExpanded(hookType)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-700/70 rounded"
                    >
                      <span className="text-gray-200">{hookType}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {count} hook{count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-gray-500">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-2">
                        {hooks.length === 0 ? (
                          <p className="text-xs text-gray-500 italic">
                            No hooks configured
                          </p>
                        ) : (
                          // Each hook group contains a matcher and an array of hook configs
                          hooks.map((group, groupIdx) => (
                            <div
                              key={groupIdx}
                              className={`p-2 rounded text-xs ${
                                isAgentwatchHookGroup(group)
                                  ? "bg-purple-900/30 border border-purple-700/50"
                                  : "bg-gray-800"
                              }`}
                            >
                              {/* Group header with matcher */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {group.matcher !== undefined &&
                                    group.matcher !== "" && (
                                      <span className="text-gray-400">
                                        matcher:{" "}
                                        <code className="text-yellow-300">
                                          {group.matcher || "*"}
                                        </code>
                                      </span>
                                    )}
                                  {isAgentwatchHookGroup(group) && (
                                    <span className="px-1.5 py-0.5 bg-purple-700 rounded text-purple-200">
                                      agentwatch
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() =>
                                    handleRemoveHook(hookType, groupIdx)
                                  }
                                  disabled={saving}
                                  className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded disabled:opacity-50"
                                  title="Remove hook group"
                                >
                                  ×
                                </button>
                              </div>
                              {/* Individual hooks in the group */}
                              <div className="space-y-1 ml-2">
                                {(group.hooks ?? []).map(
                                  (hookConfig, hookIdx) => (
                                    <div
                                      key={hookIdx}
                                      className="flex items-start gap-2 bg-gray-900/50 rounded p-1.5"
                                    >
                                      <span className="px-1.5 py-0.5 bg-gray-600 rounded text-gray-300 shrink-0">
                                        {hookConfig.type}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        {hookConfig.command && (
                                          <p className="font-mono text-gray-400 break-all text-xs">
                                            {hookConfig.command}
                                          </p>
                                        )}
                                        {hookConfig.timeout && (
                                          <span className="text-gray-500">
                                            timeout: {hookConfig.timeout}s
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Confirm Save
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              This will overwrite your Claude Code settings file. Make sure your
              JSON is correct.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRaw}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Activity Section - collapsible wrapper for AuditLogPane
function ActivitySection() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div id="activity" className="bg-gray-800 rounded-lg scroll-mt-16">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-750 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">Activity Log</h2>
          <span className="text-xs text-gray-400">
            View audit events and data sources
          </span>
        </div>
        <span className="text-gray-400">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700">
          <AuditLogPane />
        </div>
      )}
    </div>
  );
}
