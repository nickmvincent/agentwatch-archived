import { useEffect, useState } from "react";
import { UI_COMPONENTS, formatComponentName } from "../../lib/ui-registry";
import { SELF_DOCS } from "../../lib/self-docs";

const SELF_DOCS_STORAGE_KEY = "agentwatch-show-self-docs";
const SELF_DOCS_EVENT = "agentwatch:self-docs";

export function getSelfDocumentingPreference(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(SELF_DOCS_STORAGE_KEY);
  if (stored === null) return true;
  return stored === "true";
}

export function setSelfDocumentingPreference(visible: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SELF_DOCS_STORAGE_KEY, String(visible));
  window.dispatchEvent(
    new CustomEvent(SELF_DOCS_EVENT, { detail: { visible } })
  );
}

interface FileInfo {
  /** File or directory path */
  path: string;
  /** What this file contains or does */
  description?: string;
}

interface SelfDocumentingSectionProps {
  /** Section title */
  title?: string;
  /** Registry component identifier (string accepted, will look up in registry if defined) */
  componentId?: string;
  /** Render inline wrapper for compact usage */
  inline?: boolean;
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
  /** Extra class name for details wrapper */
  detailsClassName?: string;
  /** Extra class name for details content wrapper */
  contentClassName?: string;
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
  componentId,
  inline = false,
  reads = [],
  writes = [],
  tests = [],
  calculations = [],
  notes = [],
  defaultCollapsed = true,
  visible = true,
  detailsClassName,
  contentClassName,
  children,
  compact = false
}: SelfDocumentingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);

  if (!visible) {
    return <>{children}</>;
  }

  const componentLabel = componentId
    ? componentId in UI_COMPONENTS
      ? formatComponentName(
          UI_COMPONENTS[componentId as keyof typeof UI_COMPONENTS]
        )
      : componentId
    : undefined;

  const registryEntry = componentId ? SELF_DOCS[componentId] : undefined;
  const mergedTitle = registryEntry?.title ?? title;
  const mergedReads = registryEntry?.reads ?? reads;
  const mergedWrites = registryEntry?.writes ?? writes;
  const mergedTests = registryEntry?.tests ?? tests;
  const mergedCalculations = registryEntry?.calculations ?? calculations;
  const mergedNotes = registryEntry?.notes ?? notes;

  const hasContent =
    Boolean(componentLabel) ||
    mergedReads.length > 0 ||
    mergedWrites.length > 0 ||
    mergedTests.length > 0 ||
    mergedCalculations.length > 0 ||
    mergedNotes.length > 0;

  if (!hasContent) {
    return <>{children}</>;
  }

  const normalizeFileInfo = (item: string | FileInfo): FileInfo =>
    typeof item === "string" ? { path: item } : item;

  if (compact) {
    const Wrapper = inline ? "span" : "div";
    return (
      <Wrapper className={inline ? "relative inline-block" : "relative"}>
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
              title={mergedTitle}
              componentLabel={componentLabel}
              reads={mergedReads.map(normalizeFileInfo)}
              writes={mergedWrites.map(normalizeFileInfo)}
              tests={mergedTests}
              calculations={mergedCalculations}
              notes={mergedNotes}
            />
          </div>
        )}
      </Wrapper>
    );
  }

  return (
    <div className="space-y-2">
      {children}
      <details
        open={isExpanded}
        onToggle={(e) => setIsExpanded((e.target as HTMLDetailsElement).open)}
        className={`text-xs border-t border-gray-700/50 pt-2 mt-3 ${detailsClassName ?? ""}`}
      >
        <summary className="cursor-pointer text-gray-500 hover:text-gray-400 select-none flex items-center gap-1">
          <span className="text-gray-600">{isExpanded ? "▼" : "▶"}</span>
          <span>more</span>
        </summary>
        <div className={`mt-2 pl-4 ${contentClassName ?? ""}`}>
          <DocumentationContent
            title={mergedTitle}
            componentLabel={componentLabel}
            reads={mergedReads.map(normalizeFileInfo)}
            writes={mergedWrites.map(normalizeFileInfo)}
            tests={mergedTests}
            calculations={mergedCalculations}
            notes={mergedNotes}
          />
        </div>
      </details>
    </div>
  );
}

interface DocumentationContentProps {
  title?: string;
  componentLabel?: string;
  reads: FileInfo[];
  writes: FileInfo[];
  tests: string[];
  calculations: string[];
  notes: string[];
}

function DocumentationContent({
  title,
  componentLabel,
  reads,
  writes,
  tests,
  calculations,
  notes
}: DocumentationContentProps) {
  return (
    <div className="space-y-3 text-gray-400">
      {componentLabel && (
        <div>
          <div className="text-gray-500 mb-1">🏷️ Component:</div>
          <code className="text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded text-[10px] w-fit">
            {componentLabel}
          </code>
        </div>
      )}
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
  const [visible, setVisible] = useState(() => getSelfDocumentingPreference());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SELF_DOCS_STORAGE_KEY) return;
      if (event.newValue === null) {
        setVisible(true);
        return;
      }
      setVisible(event.newValue === "true");
    };

    const handlePreferenceEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      if (typeof detail?.visible === "boolean") {
        setVisible(detail.visible);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(SELF_DOCS_EVENT, handlePreferenceEvent);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(SELF_DOCS_EVENT, handlePreferenceEvent);
    };
  }, []);

  return visible;
}
