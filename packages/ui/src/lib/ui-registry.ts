export type ToolName = "Static Site";

export interface UiComponentDescriptor {
  tool: ToolName;
  section: string;
  component: string;
}

export const UI_COMPONENTS = {
  "static.share.pane": {
    tool: "Static Site",
    section: "Share",
    component: "Share Pane"
  },
  "static.share.sessions-section": {
    tool: "Static Site",
    section: "Share",
    component: "Select Sessions"
  },
  "static.share.prepare-section": {
    tool: "Static Site",
    section: "Share",
    component: "Prepare & Preview"
  },
  "static.share.export-section": {
    tool: "Static Site",
    section: "Share",
    component: "Contributor & Export"
  },
  "static.share.field-selector": {
    tool: "Static Site",
    section: "Share",
    component: "Field Selector"
  },
  "static.share.preview-panel": {
    tool: "Static Site",
    section: "Share",
    component: "Preview Panel"
  },
  "static.share.redaction-config": {
    tool: "Static Site",
    section: "Share",
    component: "Redaction Config"
  },
  "static.share.contributor-info": {
    tool: "Static Site",
    section: "Share",
    component: "Contributor Info"
  },
  "static.share.contribution-history": {
    tool: "Static Site",
    section: "Share",
    component: "Contribution History"
  },
  "static.share.ai-preference-wizard": {
    tool: "Static Site",
    section: "Share",
    component: "AI Preference Wizard"
  },
  "static.share.diff-view": {
    tool: "Static Site",
    section: "Share",
    component: "Diff View"
  },
  "static.share.chat-viewer": {
    tool: "Static Site",
    section: "Share",
    component: "Chat Viewer"
  },
  "static.share.markdown-renderer": {
    tool: "Static Site",
    section: "Share",
    component: "Markdown Renderer"
  }
} as const satisfies Record<string, UiComponentDescriptor>;

export type ComponentId = keyof typeof UI_COMPONENTS;

export function formatComponentName(descriptor: UiComponentDescriptor): string {
  return `${descriptor.tool}:${descriptor.section}:${descriptor.component}`;
}
