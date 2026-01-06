import { useEffect, useState } from "react";
import { fetchRawConfig, saveRawConfig } from "../api/client";

export function WatcherSettingsPane() {
  const [content, setContent] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRawConfig();
      setContent(data.content ?? "");
      setPath(data.path ?? "");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load config file."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

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
      <div className="bg-gray-800 rounded-lg p-4 text-gray-400">
        Loading watcher settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            Restart with <code className="bg-gray-900/60 px-1 rounded">aw watcher restart</code>
          </span>
        </div>
      </div>
    </div>
  );
}
