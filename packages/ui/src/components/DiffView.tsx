/**
 * DiffView component - shows diff between original and redacted content.
 *
 * Modes:
 * - 'full': Shows entire content with inline diff highlighting
 * - 'changes': Shows only the changes in a compact list format
 */

import { type Diff, diff_match_patch } from "diff-match-patch";
import { useMemo } from "react";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./SelfDocumentingSection";

export interface DiffViewProps {
  original: string;
  redacted: string;
  mode: "full" | "changes";
  componentId?: string;
}

const dmp = new diff_match_patch();

interface DiffChange {
  lineNumber: number;
  original: string;
  redacted: string;
}

/**
 * Compute a diff between original and redacted text.
 * Returns an array of [operation, text] tuples where:
 * - operation = -1: deleted (from original)
 * - operation = 0: equal
 * - operation = 1: inserted (in redacted)
 */
function computeDiff(original: string, redacted: string): Diff[] {
  const diffs = dmp.diff_main(original, redacted);
  dmp.diff_cleanupSemantic(diffs);
  return diffs;
}

/**
 * Extract only the changes for "changes only" mode.
 * Groups consecutive deletions and insertions together.
 */
function extractChanges(original: string, redacted: string): DiffChange[] {
  const diffs = computeDiff(original, redacted);
  const changes: DiffChange[] = [];

  // Track position in original text for line numbers
  let position = 0;

  // Count lines in text up to position
  const countLines = (text: string, upTo: number) => {
    let lines = 1;
    for (let i = 0; i < Math.min(upTo, text.length); i++) {
      if (text[i] === "\n") lines++;
    }
    return lines;
  };

  for (let i = 0; i < diffs.length; i++) {
    const diff = diffs[i];
    if (!diff) continue;
    const [op, text] = diff;

    if (op === 0) {
      // Equal - advance position
      position += text.length;
    } else if (op === -1) {
      // Deletion - look for following insertion
      const deletedText = text;
      let insertedText = "";

      // Check if next is an insertion
      const nextDiff = diffs[i + 1];
      if (i + 1 < diffs.length && nextDiff?.[0] === 1) {
        insertedText = nextDiff[1];
        i++; // Skip the insertion in main loop
      }

      changes.push({
        lineNumber: countLines(original, position),
        original: deletedText.trim(),
        redacted: insertedText.trim() || "[REMOVED]"
      });

      position += deletedText.length;
    } else if (op === 1) {
      // Pure insertion (no preceding deletion)
      changes.push({
        lineNumber: countLines(original, position),
        original: "",
        redacted: text.trim()
      });
    }
  }

  return changes;
}

/**
 * Try to pretty-print JSON, return original string if not valid JSON.
 */
function tryPrettyPrint(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

/**
 * Full diff view - shows entire content with inline highlighting.
 */
function FullDiffView({
  original,
  redacted
}: { original: string; redacted: string }) {
  const diffs = useMemo(() => {
    const prettyOriginal = tryPrettyPrint(original);
    const prettyRedacted = tryPrettyPrint(redacted);
    return computeDiff(prettyOriginal, prettyRedacted);
  }, [original, redacted]);

  return (
    <div className="font-mono text-sm whitespace-pre-wrap break-words text-gray-200">
      {diffs.map((diff, i) => {
        const [op, text] = diff;

        if (op === 0) {
          // Equal - normal text
          return <span key={i}>{text}</span>;
        } else if (op === -1) {
          // Deleted - red strikethrough (dark mode)
          return (
            <span
              key={i}
              className="bg-red-900/50 text-red-300 line-through decoration-red-400"
              title="Removed by redaction"
            >
              {text}
            </span>
          );
        } else {
          // Inserted - green highlight (dark mode)
          return (
            <span
              key={i}
              className="bg-green-900/50 text-green-300"
              title="Replacement text"
            >
              {text}
            </span>
          );
        }
      })}
    </div>
  );
}

/**
 * Changes only view - shows list of what changed.
 */
function ChangesOnlyView({
  original,
  redacted
}: { original: string; redacted: string }) {
  const changes = useMemo(
    () => extractChanges(original, redacted),
    [original, redacted]
  );

  if (changes.length === 0) {
    return (
      <div className="text-gray-400 italic text-sm">
        No redactions applied to this session.
      </div>
    );
  }

  return (
    <div className="space-y-2 font-mono text-sm">
      {changes.map((change, i) => (
        <div
          key={i}
          className="flex items-start gap-2 p-2 bg-gray-800 rounded border border-gray-700"
        >
          <span className="text-gray-500 text-xs shrink-0 w-12">
            L{change.lineNumber}
          </span>
          <div className="flex-1 min-w-0">
            {change.original && (
              <span className="bg-red-900/50 text-red-300 line-through px-1 rounded mr-1">
                {change.original.length > 50
                  ? change.original.slice(0, 47) + "..."
                  : change.original}
              </span>
            )}
            <span className="text-gray-500 mx-1">&rarr;</span>
            <span className="bg-green-900/50 text-green-300 px-1 rounded">
              {change.redacted.length > 50
                ? change.redacted.slice(0, 47) + "..."
                : change.redacted}
            </span>
          </div>
        </div>
      ))}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        {changes.length} redaction{changes.length !== 1 ? "s" : ""} applied
      </div>
    </div>
  );
}

export function DiffView({
  original,
  redacted,
  mode,
  componentId = "static.share.diff-view"
}: DiffViewProps) {
  const showSelfDocs = useSelfDocumentingVisible();

  if (!original || !redacted) {
    return (
      <SelfDocumentingSection
        componentId={componentId}
        visible={showSelfDocs}
      >
        <div className="text-gray-500 italic text-sm">
          Select a session to preview redactions
        </div>
      </SelfDocumentingSection>
    );
  }

  if (original === redacted) {
    return (
      <SelfDocumentingSection
        componentId={componentId}
        visible={showSelfDocs}
      >
        <div className="text-gray-400 italic text-sm">
          No changes - content is identical before and after redaction.
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection componentId={componentId} visible={showSelfDocs}>
      {mode === "full" ? (
        <FullDiffView original={original} redacted={redacted} />
      ) : (
        <ChangesOnlyView original={original} redacted={redacted} />
      )}
    </SelfDocumentingSection>
  );
}

export default DiffView;
