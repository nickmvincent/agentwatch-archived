import { useEffect, useState } from "react";
import {
  fetchClaudeSettings,
  fetchRawConfig,
  saveRawConfig,
  updateClaudeSettings
} from "../api/client";
import type {
  ClaudeSettings,
  ClaudeSettingsHookGroup,
  ClaudeSettingsResponse
} from "../api/types";
import { HookEnhancementsSection } from "./HookEnhancementsSection";
import {
  SelfDocumentingSection,
  setSelfDocumentingPreference,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// Standard AgentWatch hook configuration
const AGENTWATCH_HOOK_COMMAND =
  "curl -s -X POST http://localhost:8420/api/hooks";
const AGENTWATCH_HOOK_TYPES = [
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "Notification",
  "PermissionRequest",
  "UserPromptSubmit"
] as const;

type HookType = (typeof AGENTWATCH_HOOK_TYPES)[number];

function createAgentWatchHookGroup(hookType: string): ClaudeSettingsHookGroup {
  return {
    hooks: [
      {
        type: "command",
        command: `${AGENTWATCH_HOOK_COMMAND}/${hookType
          .toLowerCase()
          .replace(/([a-z])([A-Z])/g, "$1-$2")
          .toLowerCase()} -H 'Content-Type: application/json' -d '$CLAUDE_HOOK_PAYLOAD'`
      }
    ]
  };
}

function hasAgentWatchHook(
  groups: ClaudeSettingsHookGroup[] | undefined
): boolean {
  if (!groups) return false;
  return groups.some((g) =>
    g.hooks?.some(
      (h) =>
        h.command?.includes("agentwatch") ||
        h.command?.includes("localhost:8420")
    )
  );
}

export function WatcherSettingsPane() {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showSelfDocs = useSelfDocumentingVisible();

  // Notifications toggle state (parsed from content)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Claude settings state
  const [claudeSettings, setClaudeSettings] =
    useState<ClaudeSettingsResponse | null>(null);
  const [claudeError, setClaudeError] = useState<string | null>(null);
  const [hookUpdating, setHookUpdating] = useState<string | null>(null);
  const [hookMessage, setHookMessage] = useState<string | null>(null);


  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRawConfig();
      setContent(data.content ?? "");
      setPath(data.path ?? "");
      // Parse notifications.enable from TOML content
      const enableMatch = data.content?.match(
        /\[notifications\][\s\S]*?enable\s*=\s*(true|false)/
      );
      setNotificationsEnabled(enableMatch?.[1] === "true");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load config file."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadClaudeSettings = async () => {
    try {
      const data = await fetchClaudeSettings();
      setClaudeSettings(data);
      setClaudeError(null);
    } catch (err) {
      setClaudeError(
        err instanceof Error ? err.message : "Failed to load Claude settings"
      );
    }
  };

  // Toggle a single AgentWatch hook type
  const toggleHook = async (hookType: HookType) => {
    if (!claudeSettings?.settings) return;

    setHookUpdating(hookType);
    setHookMessage(null);

    try {
      const currentHooks = claudeSettings.settings.hooks || {};
      const currentGroups = currentHooks[hookType] || [];
      const hasAW = hasAgentWatchHook(currentGroups);

      let newGroups: ClaudeSettingsHookGroup[];
      if (hasAW) {
        // Remove AgentWatch hooks
        newGroups = currentGroups.filter(
          (g) =>
            !g.hooks?.some(
              (h) =>
                h.command?.includes("agentwatch") ||
                h.command?.includes("localhost:8420")
            )
        );
      } else {
        // Add AgentWatch hook
        newGroups = [...currentGroups, createAgentWatchHookGroup(hookType)];
      }

      const updates: Partial<ClaudeSettings> = {
        hooks: {
          ...currentHooks,
          [hookType]: newGroups.length > 0 ? newGroups : undefined
        }
      };

      await updateClaudeSettings(updates);
      await loadClaudeSettings();
      setHookMessage(
        `${hasAW ? "Removed" : "Added"} AgentWatch ${hookType} hook`
      );
    } catch (err) {
      setHookMessage(
        `Failed to update hook: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setHookUpdating(null);
    }
  };

  // Install all AgentWatch hooks at once
  const installAllHooks = async () => {
    if (!claudeSettings?.settings) return;

    setHookUpdating("all");
    setHookMessage(null);

    try {
      const currentHooks = claudeSettings.settings.hooks || {};
      const newHooks: ClaudeSettings["hooks"] = { ...currentHooks };

      for (const hookType of AGENTWATCH_HOOK_TYPES) {
        const currentGroups = currentHooks[hookType] || [];
        if (!hasAgentWatchHook(currentGroups)) {
          newHooks[hookType] = [
            ...currentGroups,
            createAgentWatchHookGroup(hookType)
          ];
        }
      }

      await updateClaudeSettings({ hooks: newHooks });
      await loadClaudeSettings();
      setHookMessage("Installed all AgentWatch hooks");
    } catch (err) {
      setHookMessage(
        `Failed to install hooks: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setHookUpdating(null);
    }
  };

  // Remove all AgentWatch hooks at once
  const removeAllHooks = async () => {
    if (!claudeSettings?.settings) return;

    setHookUpdating("all");
    setHookMessage(null);

    try {
      const currentHooks = claudeSettings.settings.hooks || {};
      const newHooks: ClaudeSettings["hooks"] = {};

      for (const hookType of AGENTWATCH_HOOK_TYPES) {
        const currentGroups = currentHooks[hookType] || [];
        const filtered = currentGroups.filter(
          (g) =>
            !g.hooks?.some(
              (h) =>
                h.command?.includes("agentwatch") ||
                h.command?.includes("localhost:8420")
            )
        );
        if (filtered.length > 0) {
          newHooks[hookType] = filtered;
        }
      }

      await updateClaudeSettings({ hooks: newHooks });
      await loadClaudeSettings();
      setHookMessage("Removed all AgentWatch hooks");
    } catch (err) {
      setHookMessage(
        `Failed to remove hooks: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setHookUpdating(null);
    }
  };

  // Count how many AgentWatch hooks are installed
  const countAgentWatchHooks = (): number => {
    if (!claudeSettings?.settings?.hooks) return 0;
    return AGENTWATCH_HOOK_TYPES.filter((hookType) =>
      hasAgentWatchHook(claudeSettings.settings?.hooks?.[hookType])
    ).length;
  };

  useEffect(() => {
    loadConfig();
    loadClaudeSettings();
  }, []);

  // Toggle notifications in config
  const toggleNotifications = async () => {
    const newValue = !notificationsEnabled;
    // Update the TOML content
    let newContent = content;
    if (content.includes("[notifications]")) {
      newContent = content.replace(
        /(\[notifications\][\s\S]*?enable\s*=\s*)(true|false)/,
        `$1${newValue}`
      );
    } else {
      // Add notifications section
      newContent = `${content.trim()}\n\n[notifications]\nenable = ${newValue}\n`;
    }
    setContent(newContent);
    setNotificationsEnabled(newValue);

    // Save immediately
    setSaving(true);
    try {
      await saveRawConfig(newContent);
      setMessage(
        `Notifications ${newValue ? "enabled" : "disabled"}. Restart watcher to apply.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveRawConfig(content);
      setMessage(result.message || "Config saved. Restart watcher to apply.");
      setPath(result.path || path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SelfDocumentingSection
        componentId="watcher.settings.pane"
        visible={showSelfDocs}
      >
        <div className="bg-gray-800 rounded-lg p-4 text-gray-400">
          Loading watcher settings...
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection
      componentId="watcher.settings.pane"
      visible={showSelfDocs}
    >
      <div className="space-y-4">
        {/* Quick Settings */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
          <h2 className="text-lg font-semibold text-white">Quick Settings</h2>

          {/* Notifications Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Desktop Notifications</div>
              <div className="text-xs text-gray-500">
                macOS notifications for session end, tool failures, etc.
              </div>
            </div>
            <button
              onClick={toggleNotifications}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                notificationsEnabled ? "bg-blue-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  notificationsEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Component Documentation Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">
                Component Documentation
              </div>
              <div className="text-xs text-gray-500">
                Show self-documenting sections in each pane
              </div>
            </div>
            <button
              onClick={() => setSelfDocumentingPreference(!showSelfDocs)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                showSelfDocs ? "bg-blue-600" : "bg-gray-600"
              } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showSelfDocs ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Claude Code Settings */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Claude Code Settings
              </h2>
              <p className="text-xs text-gray-500">
                From{" "}
                <code className="bg-gray-700 px-1 rounded">
                  ~/.claude/settings.json
                </code>
              </p>
            </div>
            <button
              onClick={loadClaudeSettings}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Refresh
            </button>
          </div>

          {claudeError ? (
            <div className="text-sm text-red-400">{claudeError}</div>
          ) : !claudeSettings ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : (
            <div className="space-y-4">
              {/* AgentWatch Hooks Integration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-300">
                    AgentWatch Hooks
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {countAgentWatchHooks()}/{AGENTWATCH_HOOK_TYPES.length}{" "}
                      installed
                    </span>
                    {countAgentWatchHooks() < AGENTWATCH_HOOK_TYPES.length ? (
                      <button
                        onClick={installAllHooks}
                        disabled={hookUpdating !== null}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded"
                      >
                        {hookUpdating === "all"
                          ? "Installing..."
                          : "Install All"}
                      </button>
                    ) : (
                      <button
                        onClick={removeAllHooks}
                        disabled={hookUpdating !== null}
                        className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white rounded"
                      >
                        {hookUpdating === "all" ? "Removing..." : "Remove All"}
                      </button>
                    )}
                  </div>
                </div>

                {hookMessage && (
                  <div
                    className={`text-xs mb-2 px-2 py-1 rounded ${
                      hookMessage.includes("Failed")
                        ? "bg-red-900/30 text-red-300"
                        : "bg-green-900/30 text-green-300"
                    }`}
                  >
                    {hookMessage}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {AGENTWATCH_HOOK_TYPES.map((hookType) => {
                    const groups =
                      claudeSettings.settings?.hooks?.[hookType] ?? [];
                    const hasAW = hasAgentWatchHook(groups);
                    const totalHooks = groups.length;
                    const isUpdating = hookUpdating === hookType;

                    return (
                      <button
                        key={hookType}
                        onClick={() => toggleHook(hookType)}
                        disabled={hookUpdating !== null}
                        className={`px-2 py-2 rounded text-xs text-left transition-colors ${
                          hasAW
                            ? "bg-blue-900/50 hover:bg-blue-900/70 text-blue-300 border border-blue-700"
                            : "bg-gray-900/50 hover:bg-gray-800 text-gray-400 border border-gray-700"
                        } ${hookUpdating !== null ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                        title={
                          hasAW
                            ? "Click to remove AgentWatch hook"
                            : "Click to add AgentWatch hook"
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">
                            {hookType}
                          </span>
                          {isUpdating ? (
                            <span className="text-[10px] text-gray-400">
                              ...
                            </span>
                          ) : hasAW ? (
                            <span className="text-[10px] text-blue-400">
                              AW
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-600">+</span>
                          )}
                        </div>
                        {totalHooks > 0 && (
                          <div className="text-[10px] mt-0.5 opacity-60">
                            {totalHooks} hook{totalHooks !== 1 ? "s" : ""}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Click a hook type to toggle AgentWatch integration.{" "}
                  <span className="text-blue-400">AW</span> = AgentWatch enabled
                </p>
              </div>

              {/* Permissions */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Permissions
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Allow patterns */}
                  <div className="bg-gray-900/50 rounded p-2">
                    <div className="text-xs text-green-400 mb-1">
                      Allow (
                      {claudeSettings.settings?.permissions?.allow?.length ?? 0}
                      )
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {(claudeSettings.settings?.permissions?.allow ?? [])
                        .length === 0 ? (
                        <span className="text-xs text-gray-600">None</span>
                      ) : (
                        (claudeSettings.settings?.permissions?.allow ?? []).map(
                          (p, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-green-900/50 text-green-300 text-[10px] rounded font-mono"
                              title={p}
                            >
                              {p.length > 30 ? p.slice(0, 30) + "..." : p}
                            </span>
                          )
                        )
                      )}
                    </div>
                  </div>

                  {/* Deny patterns */}
                  <div className="bg-gray-900/50 rounded p-2">
                    <div className="text-xs text-red-400 mb-1">
                      Deny (
                      {claudeSettings.settings?.permissions?.deny?.length ?? 0})
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                      {(claudeSettings.settings?.permissions?.deny ?? [])
                        .length === 0 ? (
                        <span className="text-xs text-gray-600">None</span>
                      ) : (
                        (claudeSettings.settings?.permissions?.deny ?? []).map(
                          (p, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-red-900/50 text-red-300 text-[10px] rounded font-mono"
                              title={p}
                            >
                              {p.length > 30 ? p.slice(0, 30) + "..." : p}
                            </span>
                          )
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sandbox Status */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">
                  Sandbox
                </h3>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      claudeSettings.settings?.sandbox?.enabled
                        ? "bg-green-900/50 text-green-300"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {claudeSettings.settings?.sandbox?.enabled
                      ? "Enabled"
                      : "Disabled"}
                  </span>
                  {claudeSettings.settings?.sandbox?.network
                    ?.allowedDomains && (
                    <span className="text-xs text-gray-500">
                      {
                        claudeSettings.settings.sandbox.network.allowedDomains
                          .length
                      }{" "}
                      allowed domains
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-2">
            Watcher Settings
          </h2>
          <p className="text-sm text-gray-400 mb-3">
            Edit the watcher configuration file directly. Changes take effect
            after restarting the watcher process.
          </p>
          {path && (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Config file:</span>
              <code className="bg-gray-900/60 px-1 rounded">{path}</code>
              <button
                onClick={() => navigator.clipboard.writeText(path)}
                className="text-blue-400 hover:text-blue-300"
                type="button"
              >
                Copy path
              </button>
            </div>
          )}
        </div>

        <HookEnhancementsSection />

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm rounded p-3">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 text-sm rounded p-3">
            {message}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-[420px] bg-gray-900 border border-gray-700 text-gray-200 text-sm font-mono rounded p-3"
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            <button
              onClick={loadConfig}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
            >
              Reload
            </button>
            <span className="text-xs text-gray-500 ml-auto">
              Restart with{" "}
              <code className="bg-gray-900/60 px-1 rounded">
                aw watcher restart
              </code>
            </span>
          </div>
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
