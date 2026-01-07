import { useState } from "react";

interface FileInfo {
  /** File or directory path */
  path: string;
  /** What this file contains or does */
  description?: string;
}

interface SelfDocumentingSectionProps {
  /** Section title */
  title?: string;
  /** Files this component reads from */
  reads?: (string | FileInfo)[];
  /** Files this component writes to */
  writes?: (string | FileInfo)[];
  /** Related test file paths */
  tests?: string[];
  /** Key calculations or algorithms used */
  calculations?: string[];
  /** Additional notes or context */
  notes?: string[];
  /** Start collapsed (default: true) */
  defaultCollapsed?: boolean;
  /** Whether to show this section at all (can be controlled by user settings) */
  visible?: boolean;
  /** Content to wrap */
  children?: React.ReactNode;
  /** Compact mode - just show a small expandable icon */
  compact?: boolean;
}

/**
 * Self-documenting expandable section.
 *
 * Wraps any component with transparency information:
 * - What files it reads/writes
 * - Related test files
 * - Key calculations/algorithms
 *
 * Design principle: Users should never wonder "where does this data go?"
 */
export function SelfDocumentingSection({
  title,
  reads = [],
  writes = [],
  tests = [],
  calculations = [],
  notes = [],
  defaultCollapsed = true,
  visible = true,
  children,
  compact = false
}: SelfDocumentingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  if (!visible) {
    return <>{children}</>;
  }

  const hasContent =
    reads.length > 0 ||
    writes.length > 0 ||
    tests.length > 0 ||
    calculations.length > 0 ||
    notes.length > 0;

  if (!hasContent) {
    return <>{children}</>;
  }

  const normalizeFileInfo = (item: string | FileInfo): FileInfo =>
    typeof item === "string" ? { path: item } : item;

  if (compact) {
    return (
      <div className="relative">
        {children}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-gray-700/50 text-gray-400 text-[10px] flex items-center justify-center hover:bg-gray-600 hover:text-gray-300 transition-colors"
          title="Show component documentation"
        >
          ?
        </button>
        {isExpanded && (
          <div className="absolute top-8 right-1 z-50 w-80 p-3 bg-gray-900 border border-gray-600 rounded-lg shadow-xl text-xs">
            <DocumentationContent
              title={title}
              reads={reads.map(normalizeFileInfo)}
              writes={writes.map(normalizeFileInfo)}
              tests={tests}
              calculations={calculations}
              notes={notes}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {children}
      <details
        open={isExpanded}
        onToggle={(e) => setIsExpanded((e.target as HTMLDetailsElement).open)}
        className="text-xs border-t border-gray-700/50 pt-2 mt-3"
      >
        <summary className="cursor-pointer text-gray-500 hover:text-gray-400 select-none flex items-center gap-1">
          <span className="text-gray-600">{isExpanded ? "▼" : "▶"}</span>
          <span>About this data</span>
        </summary>
        <div className="mt-2 pl-4">
          <DocumentationContent
            title={title}
            reads={reads.map(normalizeFileInfo)}
            writes={writes.map(normalizeFileInfo)}
            tests={tests}
            calculations={calculations}
            notes={notes}
          />
        </div>
      </details>
    </div>
  );
}

interface DocumentationContentProps {
  title?: string;
  reads: FileInfo[];
  writes: FileInfo[];
  tests: string[];
  calculations: string[];
  notes: string[];
}

function DocumentationContent({
  title,
  reads,
  writes,
  tests,
  calculations,
  notes
}: DocumentationContentProps) {
  return (
    <div className="space-y-3 text-gray-400">
      {title && (
        <div className="text-gray-300 font-medium border-b border-gray-700 pb-1 mb-2">
          {title}
        </div>
      )}

      {reads.length > 0 && (
        <FileList label="Reads from" files={reads} icon="📖" />
      )}

      {writes.length > 0 && (
        <FileList label="Writes to" files={writes} icon="💾" />
      )}

      {tests.length > 0 && (
        <div>
          <div className="text-gray-500 mb-1">🧪 Tests:</div>
          <ul className="list-none space-y-0.5 pl-4">
            {tests.map((test) => (
              <li key={test}>
                <code className="text-gray-500 bg-gray-800 px-1 rounded text-[10px]">
                  {test}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {calculations.length > 0 && (
        <div>
          <div className="text-gray-500 mb-1">📊 Calculations:</div>
          <ul className="list-disc list-inside space-y-0.5 pl-2 text-gray-500">
            {calculations.map((calc, i) => (
              <li key={i}>{calc}</li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <div className="text-gray-500 mb-1">📝 Notes:</div>
          <ul className="list-disc list-inside space-y-0.5 pl-2 text-gray-500">
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface FileListProps {
  label: string;
  files: FileInfo[];
  icon: string;
}

function FileList({ label, files, icon }: FileListProps) {
  return (
    <div>
      <div className="text-gray-500 mb-1">
        {icon} {label}:
      </div>
      <ul className="list-none space-y-1 pl-4">
        {files.map((file) => (
          <li key={file.path} className="flex flex-col">
            <code className="text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded text-[10px] w-fit">
              {file.path}
            </code>
            {file.description && (
              <span className="text-gray-600 text-[10px] mt-0.5 pl-1">
                {file.description}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Hook to check if self-documenting sections should be visible.
 * Can be controlled by user settings in the future.
 */
export function useSelfDocumentingVisible(): boolean {
  // TODO: Read from user settings
  // For now, always show
  return true;
}
