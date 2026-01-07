export interface SelfDocFileInfo {
  path: string;
  description?: string;
}

export interface SelfDocEntry {
  title?: string;
  reads?: (string | SelfDocFileInfo)[];
  writes?: (string | SelfDocFileInfo)[];
  tests?: string[];
  calculations?: string[];
  notes?: string[];
}

export const SELF_DOCS: Record<string, SelfDocEntry> = {
  "static.share.pane": {
    title: "Share flow",
    reads: [
      {
        path: "adapter.getFieldSchemas",
        description: "Field schema definitions and defaults"
      },
      {
        path: "adapter.prepareSessions",
        description: "Redaction and preview preparation"
      },
      {
        path: "adapter.exportBundle",
        description: "Bundle export and share data"
      }
    ],
    notes: [
      "Supports both daemon API and worker-based adapters.",
      "Sections map to select, prepare, and export steps."
    ]
  },
  "static.share.sessions-section": {
    title: "Select Sessions",
    notes: [
      "Session list supports search, sort, and multi-select.",
      "Session loader can be injected for uploads."
    ]
  },
  "static.share.prepare-section": {
    title: "Prepare & Preview",
    notes: [
      "Redaction config and field selection update live previews.",
      "Preview modes include diffs and raw JSON."
    ]
  },
  "static.share.export-section": {
    title: "Contributor & Export",
    notes: [
      "Contributor metadata and licensing live here.",
      "Export requires rights and review confirmations."
    ]
  },
  "static.share.field-selector": {
    title: "Field selector",
    notes: [
      "Groups fields by category and highlights privacy risks.",
      "Essential fields are always included."
    ]
  },
  "static.share.preview-panel": {
    title: "Preview panel",
    notes: [
      "Supports full diff, changes-only, original, and raw JSON modes.",
      "Field stripping and warnings are shown below the preview."
    ]
  },
  "static.share.redaction-config": {
    title: "Redaction config",
    notes: [
      "Toggles redact secrets, PII, and paths.",
      "Custom regex patterns are appended to the rule set."
    ]
  },
  "static.share.contributor-info": {
    title: "Contributor info",
    notes: [
      "Captures contributor ID, license, and AI preference.",
      "Attestations are required before export."
    ]
  },
  "static.share.contribution-history": {
    title: "Contribution history",
    notes: ["Shows recent export destinations and counts."]
  },
  "static.share.ai-preference-wizard": {
    title: "AI preference",
    calculations: ["Parse and build W3C TDM preference strings"],
    notes: [
      "Supports preset and advanced modes.",
      "Advanced mode toggles conditions and attribution."
    ]
  },
  "static.share.diff-view": {
    title: "Diff viewer",
    calculations: ["diff-match-patch semantic diffing"],
    notes: ["Supports full inline view or changes-only view."]
  },
  "static.share.chat-viewer": {
    title: "Chat viewer",
    notes: ["Renders transcripts with role-based styling."]
  },
  "static.share.markdown-renderer": {
    title: "Markdown renderer",
    calculations: [
      "Custom markdown parsing with code block preservation",
      "HTML tag escaping for safety"
    ]
  }
};
