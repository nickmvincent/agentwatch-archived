/**
 * FieldTree - Hierarchical field selection component with tree view.
 *
 * Displays fields as a collapsible tree structure, allowing users to:
 * - Toggle parent nodes to select/deselect all children
 * - See indeterminate state when some children are selected
 * - View content-heavy warnings on sensitive fields
 * - Apply preset profiles (Safe Default, Full Content, etc.)
 */

import { useCallback, useMemo, useState } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// Field categories for visual styling
const ESSENTIAL_FIELDS = new Set([
  "type",
  "role",
  "content",
  "text",
  "message.role",
  "message.content"
]);

// Fields known to contain large/sensitive content
const CONTENT_HEAVY_FIELDS = new Set([
  "tool_usages[].tool_input",
  "tool_usages[].tool_response",
  "messages[].content",
  "messages[].message.content",
  "aggregated_output",
  "command"
]);

// Sensitive fields that may contain PII
const SENSITIVE_FIELDS = new Set([
  "cwd",
  "sourcePathHint",
  "original_path_hint",
  "filePath",
  "toolUseResult",
  "hookErrors",
  "hookInfos",
  "session.cwd",
  "session.transcript_path",
  "tool_usages[].cwd"
]);

export interface RedactionProfile {
  id: string;
  name: string;
  description?: string;
  keptFields: string[];
  isDefault?: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isArray: boolean;
  isLeaf: boolean;
}

interface FieldTreeProps {
  /** Fields grouped by source type */
  fieldsBySource?: Record<string, string[]>;
  /** Currently selected field paths */
  selectedFields: Set<string>;
  /** Callback when a field is toggled */
  onToggleField: (path: string) => void;
  /** Callback to select all fields */
  onSelectAll: () => void;
  /** Callback to clear to essential only */
  onSelectNone: () => void;
  /** Get threat info for a field (e.g., matched redaction rule) */
  getFieldThreatInfo: (path: string) => string | null;
  /** Available preset profiles */
  profiles?: RedactionProfile[];
  /** Currently active profile ID */
  activeProfileId?: string;
  /** Callback when profile is selected */
  onSelectProfile?: (profileId: string) => void;
  /** Callback to save current selection as profile */
  onSaveAsProfile?: () => void;
}

// Source type display labels
const SOURCE_TYPE_LABELS: Record<string, string> = {
  cc_hook: "Claude Code Hooks",
  cc_transcript: "Claude Code Transcripts",
  codex_transcript: "Codex Transcripts",
  opencode_transcript: "OpenCode Transcripts"
};

/**
 * Build a tree structure from flat field paths.
 */
function buildTree(fields: string[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    children: new Map(),
    isArray: false,
    isLeaf: false
  };

  for (const field of fields) {
    // Split path on dots, but keep [] attached to preceding segment
    // e.g., "tool_usages[].tool_input.file_path" -> ["tool_usages[]", "tool_input", "file_path"]
    const parts: string[] = [];
    let current_segment = "";

    for (let i = 0; i < field.length; i++) {
      const ch = field[i];
      if (ch === ".") {
        if (current_segment) {
          parts.push(current_segment);
          current_segment = "";
        }
      } else {
        current_segment += ch;
      }
    }
    if (current_segment) {
      parts.push(current_segment);
    }

    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isArray = part.includes("[]");
      const cleanPart = part.replace("[]", "");
      currentPath = currentPath ? `${currentPath}.${part}` : part;

      if (!current.children.has(cleanPart)) {
        current.children.set(cleanPart, {
          name: cleanPart,
          path: currentPath,
          children: new Map(),
          isArray,
          isLeaf: i === parts.length - 1
        });
      } else if (i < parts.length - 1) {
        // If we're traversing to add a deeper path, this node is no longer a leaf
        current.children.get(cleanPart)!.isLeaf = false;
      }

      current = current.children.get(cleanPart)!;
    }
  }

  return root;
}

/**
 * Get all leaf paths under a node.
 */
function getAllLeafPaths(node: TreeNode): string[] {
  if (node.isLeaf || node.children.size === 0) {
    return node.path ? [node.path] : [];
  }

  const paths: string[] = [];
  for (const child of node.children.values()) {
    paths.push(...getAllLeafPaths(child));
  }
  return paths;
}

/**
 * Get selection state for a node (all, some, none).
 */
function getSelectionState(
  node: TreeNode,
  selectedFields: Set<string>
): "all" | "some" | "none" {
  const leafPaths = getAllLeafPaths(node);
  if (leafPaths.length === 0) return "none";

  const selectedCount = leafPaths.filter((p) => selectedFields.has(p)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === leafPaths.length) return "all";
  return "some";
}

/**
 * Check if a field is essential (cannot be removed).
 */
function isEssentialField(path: string): boolean {
  const normalized = path.replace(/\[\]/g, "");
  return (
    ESSENTIAL_FIELDS.has(normalized) ||
    ESSENTIAL_FIELDS.has(path) ||
    Array.from(ESSENTIAL_FIELDS).some(
      (e) => normalized.endsWith("." + e) || path.endsWith("." + e)
    )
  );
}

/**
 * Check if a field contains heavy content.
 */
function isContentHeavyField(path: string): boolean {
  const normalized = path.replace(/\[\d+\]/g, "[]");
  return CONTENT_HEAVY_FIELDS.has(normalized) || CONTENT_HEAVY_FIELDS.has(path);
}

/**
 * Check if a field is sensitive.
 */
function isSensitiveField(path: string): boolean {
  const normalized = path.replace(/\[\]/g, "");
  return (
    SENSITIVE_FIELDS.has(normalized) ||
    SENSITIVE_FIELDS.has(path) ||
    Array.from(SENSITIVE_FIELDS).some((s) => normalized.includes(s))
  );
}

interface TreeNodeComponentProps {
  node: TreeNode;
  selectedFields: Set<string>;
  onToggleField: (path: string) => void;
  getFieldThreatInfo: (path: string) => string | null;
  depth: number;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
}

function TreeNodeComponent({
  node,
  selectedFields,
  onToggleField,
  getFieldThreatInfo,
  depth,
  expandedPaths,
  onToggleExpand
}: TreeNodeComponentProps) {
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children.size > 0;
  const selectionState = getSelectionState(node, selectedFields);
  const isEssential = isEssentialField(node.path);
  const isContentHeavy = isContentHeavyField(node.path);
  const isSensitive = isSensitiveField(node.path);
  const threatInfo = getFieldThreatInfo(node.path);

  // Toggle all children when clicking parent
  const handleToggle = useCallback(() => {
    if (isEssential) return;

    const leafPaths = getAllLeafPaths(node);
    const shouldSelect = selectionState !== "all";

    for (const path of leafPaths) {
      if (!isEssentialField(path)) {
        const isCurrentlySelected = selectedFields.has(path);
        if (shouldSelect !== isCurrentlySelected) {
          onToggleField(path);
        }
      }
    }
  }, [node, selectionState, selectedFields, onToggleField, isEssential]);

  // Checkbox visual
  const checkboxIcon =
    selectionState === "all" ? "☑" : selectionState === "some" ? "☐" : "☐";
  const checkboxClass =
    selectionState === "all"
      ? "text-blue-400"
      : selectionState === "some"
        ? "text-blue-400/50"
        : "text-gray-500";

  // Node styling
  let nodeClass = "text-gray-300";
  if (isEssential) nodeClass = "text-green-400 opacity-70";
  else if (isContentHeavy) nodeClass = "text-orange-400";
  else if (isSensitive) nodeClass = "text-yellow-400";

  const paddingLeft = depth * 16;

  return (
    <div>
      <div
        className="flex items-center py-0.5 hover:bg-gray-700/30 group"
        style={{ paddingLeft }}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            onClick={() => onToggleExpand(node.path)}
            className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-300"
          >
            {isExpanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Checkbox */}
        <button
          onClick={handleToggle}
          disabled={isEssential}
          className={`w-4 h-4 flex items-center justify-center ${checkboxClass} ${isEssential ? "cursor-not-allowed" : "cursor-pointer"}`}
          title={isEssential ? "Essential field - cannot be removed" : ""}
        >
          {selectionState === "some" ? "◧" : checkboxIcon}
        </button>

        {/* Node name */}
        <span className={`ml-1 text-xs font-mono ${nodeClass}`}>
          {node.name}
          {node.isArray && (
            <span className="text-gray-500 text-[10px]">[]</span>
          )}
        </span>

        {/* Badges */}
        <span className="ml-1 flex gap-1">
          {isContentHeavy && (
            <span
              className="px-1 py-0 text-[9px] bg-orange-900/50 text-orange-300 rounded"
              title="Contains large content (file contents, command outputs)"
            >
              CONTENT
            </span>
          )}
          {isSensitive && !isContentHeavy && (
            <span
              className="px-1 py-0 text-[9px] bg-yellow-900/50 text-yellow-300 rounded"
              title="May contain sensitive information (paths, PII)"
            >
              SENSITIVE
            </span>
          )}
          {isEssential && (
            <span
              className="px-1 py-0 text-[9px] bg-green-900/50 text-green-300 rounded"
              title="Essential field - cannot be removed"
            >
              REQ
            </span>
          )}
          {threatInfo && (
            <span
              className="px-1 py-0 text-[9px] bg-red-900/50 text-red-300 rounded"
              title={threatInfo}
            >
              !
            </span>
          )}
        </span>
      </div>

      {/* Children (lazy render) */}
      {hasChildren && isExpanded && (
        <div>
          {Array.from(node.children.values()).map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              selectedFields={selectedFields}
              onToggleField={onToggleField}
              getFieldThreatInfo={getFieldThreatInfo}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldTree({
  fieldsBySource,
  selectedFields,
  onToggleField,
  onSelectAll,
  onSelectNone,
  getFieldThreatInfo,
  profiles,
  activeProfileId,
  onSelectProfile,
  onSaveAsProfile
}: FieldTreeProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const selfDocs = {
    title: "Field selection",
    componentId: "analyzer.share.field-tree",
    calculations: [
      "Tree construction from dot-path fields",
      "Tri-state selection for parent nodes",
      "Sensitive/content-heavy field classification"
    ],
    notes: [
      "Essential fields cannot be removed.",
      "Profiles apply pre-built field selections."
    ]
  };
  const [expandedSources, setExpandedSources] = useState<Set<string>>(
    new Set(["cc_hook", "cc_transcript"])
  );
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["session", "tool_usages", "messages"])
  );

  // Build trees for each source
  const trees = useMemo(() => {
    if (!fieldsBySource) return {};
    const result: Record<string, TreeNode> = {};
    for (const [source, fields] of Object.entries(fieldsBySource)) {
      result[source] = buildTree(fields);
    }
    return result;
  }, [fieldsBySource]);

  // Count fields by source
  const sourceCounts = useMemo(() => {
    if (!fieldsBySource) return {};
    const counts: Record<string, { total: number; selected: number }> = {};
    for (const [source, fields] of Object.entries(fieldsBySource)) {
      counts[source] = {
        total: fields.length,
        selected: fields.filter((f) => selectedFields.has(f)).length
      };
    }
    return counts;
  }, [fieldsBySource, selectedFields]);

  const toggleSource = (source: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (!fieldsBySource || Object.keys(fieldsBySource).length === 0) {
    return (
      <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
        <div className="p-3 bg-gray-900/50 rounded">
          <div className="text-sm font-medium text-gray-300 mb-2">Fields</div>
          <div className="text-xs text-gray-500">
            Select sessions to see available fields
          </div>
        </div>
      </SelfDocumentingSection>
    );
  }

  const totalFields = Object.values(fieldsBySource).reduce(
    (sum, fields) => sum + fields.length,
    0
  );
  const totalSelected = Object.values(fieldsBySource).reduce(
    (sum, fields) => sum + fields.filter((f) => selectedFields.has(f)).length,
    0
  );

  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
      <div className="p-3 bg-gray-900/50 rounded">
        {/* Header with profile selector */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-gray-300">
            Fields ({totalSelected}/{totalFields})
          </div>
          <div className="flex gap-1">
            {/* Profile dropdown */}
            {profiles && profiles.length > 0 && onSelectProfile && (
              <select
                value={activeProfileId || ""}
                onChange={(e) => onSelectProfile(e.target.value)}
                className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>
                  Select profile...
                </option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={onSelectAll}
              className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              title="Select all fields"
            >
              All
            </button>
            <button
              onClick={onSelectNone}
              className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
              title="Keep only essential fields"
            >
              Essential
            </button>
            {onSaveAsProfile && (
              <button
                onClick={onSaveAsProfile}
                className="px-2 py-0.5 text-xs bg-blue-700 text-white rounded hover:bg-blue-600"
                title="Save current selection as a profile"
              >
                Save
              </button>
            )}
          </div>
        </div>

        {/* Source type sections */}
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {Object.entries(trees).map(([source, tree]) => {
            const counts = sourceCounts[source];
            const isExpanded = expandedSources.has(source);
            const label = SOURCE_TYPE_LABELS[source] || source;

            return (
              <div
                key={source}
                className="border border-gray-700 rounded overflow-hidden"
              >
                <button
                  onClick={() => toggleSource(source)}
                  className="w-full px-2 py-1.5 bg-gray-800 flex items-center justify-between hover:bg-gray-750 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        source.includes("hook")
                          ? "bg-green-500"
                          : source.includes("claude") || source.includes("cc_")
                            ? "bg-purple-500"
                            : source.includes("codex")
                              ? "bg-blue-500"
                              : "bg-gray-500"
                      }`}
                    />
                    <span className="text-xs font-medium text-gray-300">
                      {label}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      ({counts?.selected || 0}/{counts?.total || 0})
                    </span>
                  </div>
                  <span className="text-gray-500 text-xs">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="bg-gray-900/50 py-1">
                    {Array.from(tree.children.values()).map((child) => (
                      <TreeNodeComponent
                        key={child.path}
                        node={child}
                        selectedFields={selectedFields}
                        onToggleField={onToggleField}
                        getFieldThreatInfo={getFieldThreatInfo}
                        depth={1}
                        expandedPaths={expandedPaths}
                        onToggleExpand={toggleExpand}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-2 pt-2 border-t border-gray-700 flex flex-wrap gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="px-1 bg-green-900/50 text-green-300 rounded">
              REQ
            </span>
            Essential
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1 bg-orange-900/50 text-orange-300 rounded">
              CONTENT
            </span>
            Large content
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1 bg-yellow-900/50 text-yellow-300 rounded">
              SENSITIVE
            </span>
            May contain PII
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-400">☑</span>
            Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="text-blue-400/50">◧</span>
            Partial
          </span>
        </div>

        {/* Help */}
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
            How field selection works
          </summary>
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs text-gray-400 space-y-1">
            <div>
              Click parent nodes to toggle all children. Click individual fields
              to toggle them.
            </div>
            <div>
              <span className="text-orange-400">CONTENT</span> fields contain
              file contents, command outputs, or large data.
            </div>
            <div>
              <span className="text-yellow-400">SENSITIVE</span> fields may
              contain paths with usernames or other PII.
            </div>
            <div>
              <span className="text-green-400">REQ</span> fields are essential
              and cannot be removed.
            </div>
            <div className="pt-1 border-t border-gray-700">
              Use profiles to quickly apply common configurations. "Safe
              Default" excludes content-heavy fields.
            </div>
          </div>
        </details>
      </div>
    </SelfDocumentingSection>
  );
}
