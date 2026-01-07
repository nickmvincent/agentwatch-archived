import { useEffect, useState } from "react";
import {
  type DocContent,
  type DocInfo,
  fetchDoc,
  fetchDocs
} from "../api/client";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

// Define the order and grouping of docs for better navigation
const DOC_ORDER = [
  // Getting Started - essential docs for new users
  { id: "glossary", group: "Getting Started" },
  { id: "getting-started", group: "Getting Started" },
  { id: "data-sources", group: "Getting Started" },

  // Core Guides
  { id: "security", group: "Core Guides" },
  { id: "configuration", group: "Core Guides" },
  { id: "user-stories", group: "Core Guides" },

  // Reference
  { id: "api-reference", group: "Reference" },
  { id: "permission-syntax", group: "Reference" },
  { id: "docker-sandbox", group: "Reference" },
  { id: "tui-vs-web", group: "Reference" },

  // Conceptual
  { id: "value-enrichment", group: "Conceptual" },

  // For Contributors
  { id: "vision", group: "For Contributors" },
  { id: "roadmap-todos", group: "For Contributors" },
  { id: "memory-management", group: "For Contributors" }
];

export function DocumentationPane() {
  const showSelfDocs = useSelfDocumentingVisible();
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docContent, setDocContent] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDocs();
  }, []);

  useEffect(() => {
    if (selectedDoc) {
      loadDoc(selectedDoc);
    }
  }, [selectedDoc]);

  async function loadDocs() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDocs();
      if (result.error) {
        setError(result.error);
      }
      // Sort docs according to our defined order
      const sortedDocs = result.docs.sort((a, b) => {
        const aIdx = DOC_ORDER.findIndex((d) => d.id === a.id);
        const bIdx = DOC_ORDER.findIndex((d) => d.id === b.id);
        if (aIdx === -1 && bIdx === -1) return a.title.localeCompare(b.title);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      });
      setDocs(sortedDocs);

      // Auto-select first doc
      if (sortedDocs.length > 0 && !selectedDoc) {
        setSelectedDoc(sortedDocs[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documentation");
    } finally {
      setLoading(false);
    }
  }

  async function loadDoc(id: string) {
    setDocLoading(true);
    try {
      const doc = await fetchDoc(id);
      setDocContent(doc);
    } catch (e) {
      setDocContent(null);
      setError(e instanceof Error ? e.message : "Failed to load document");
    } finally {
      setDocLoading(false);
    }
  }

  // Group docs for sidebar
  const groupedDocs = DOC_ORDER.reduce(
    (acc, item) => {
      const doc = docs.find((d) => d.id === item.id);
      if (doc) {
        if (!acc[item.group]) acc[item.group] = [];
        acc[item.group].push(doc);
      }
      return acc;
    },
    {} as Record<string, DocInfo[]>
  );

  // Add any docs not in DOC_ORDER to "Other" group
  const orderedIds = new Set(DOC_ORDER.map((d) => d.id));
  const otherDocs = docs.filter((d) => !orderedIds.has(d.id));
  if (otherDocs.length > 0) {
    groupedDocs["Other"] = otherDocs;
  }

  if (loading) {
    return (
      <SelfDocumentingSection
        componentId="analyzer.docs.pane"
        visible={showSelfDocs}
      >
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-gray-400">Loading documentation...</div>
        </div>
      </SelfDocumentingSection>
    );
  }

  if (error && docs.length === 0) {
    return (
      <SelfDocumentingSection
        componentId="analyzer.docs.pane"
        visible={showSelfDocs}
      >
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-red-400">Error: {error}</div>
          <button
            onClick={loadDocs}
            className="mt-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Retry
          </button>
        </div>
      </SelfDocumentingSection>
    );
  }

  return (
    <SelfDocumentingSection
      componentId="analyzer.docs.pane"
      visible={showSelfDocs}
    >
      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* Sidebar */}
        <div className="w-64 shrink-0 bg-gray-800 rounded-lg p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold text-white mb-4">
            Documentation
          </h2>

          {Object.entries(groupedDocs).map(([group, groupDocs]) => (
            <div key={group} className="mb-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                {group}
              </div>
              <div className="space-y-1">
                {groupDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedDoc === doc.id
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {doc.title}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {docs.length === 0 && (
            <p className="text-gray-500 text-sm">
              No documentation found. Make sure docs are in the{" "}
              <code>docs/</code> directory.
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-800 rounded-lg p-6 overflow-y-auto">
          {docLoading ? (
            <div className="text-gray-400">Loading...</div>
          ) : docContent ? (
            <div>
              <MarkdownRenderer content={docContent.content} />
            </div>
          ) : (
            <div className="text-gray-500">
              Select a document from the sidebar to view it.
            </div>
          )}
        </div>
      </div>
    </SelfDocumentingSection>
  );
}
