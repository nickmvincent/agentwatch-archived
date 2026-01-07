export type ToolName = "Watcher" | "Analyzer" | "Static Site";

export interface UiComponentDescriptor {
  tool: ToolName;
  section: string;
  component: string;
}

export const UI_COMPONENTS = {
  "watcher.global.header": {
    tool: "Watcher",
    section: "Global",
    component: "Header"
  },
  "watcher.agents.pane": {
    tool: "Watcher",
    section: "Agents",
    component: "Agent Pane"
  },
  "watcher.agents.detail-modal": {
    tool: "Watcher",
    section: "Agents",
    component: "Agent Detail Modal"
  },
  "watcher.agents.annotation-panel": {
    tool: "Watcher",
    section: "Agents",
    component: "Annotation Panel"
  },
  "watcher.agents.hook-timeline": {
    tool: "Watcher",
    section: "Agents",
    component: "Hook Timeline"
  },
  "watcher.agents.hook-enhancements": {
    tool: "Watcher",
    section: "Agents",
    component: "Hook Enhancements"
  },
  "watcher.repos.pane": {
    tool: "Watcher",
    section: "Repos",
    component: "Projects Pane"
  },
  "watcher.repos.repo-pane": {
    tool: "Watcher",
    section: "Repos",
    component: "Repo Pane"
  },
  "watcher.ports.pane": {
    tool: "Watcher",
    section: "Ports",
    component: "Ports Pane"
  },
  "watcher.activity.pane": {
    tool: "Watcher",
    section: "Activity",
    component: "Activity Feed"
  },
  "watcher.hooks.pane": {
    tool: "Watcher",
    section: "Hooks",
    component: "Hooks Pane"
  },
  "watcher.command.pane": {
    tool: "Watcher",
    section: "Command",
    component: "Command Center"
  },
  "watcher.settings.pane": {
    tool: "Watcher",
    section: "Settings",
    component: "Watcher Settings"
  },
  "watcher.settings.hook-enhancements": {
    tool: "Watcher",
    section: "Settings",
    component: "Hook Enhancements"
  },
  "analyzer.global.header": {
    tool: "Analyzer",
    section: "Global",
    component: "Header"
  },
  "analyzer.conversations.pane": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Conversations Pane"
  },
  "analyzer.conversations.card": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Conversation Card"
  },
  "analyzer.conversations.detail-modal": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Conversation Detail Modal"
  },
  "analyzer.conversations.annotation-panel": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Annotation Panel"
  },
  "analyzer.conversations.workflow-widget": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Workflow Progress"
  },
  "analyzer.conversations.chat-viewer": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Chat Viewer"
  },
  "analyzer.conversations.diff-view": {
    tool: "Analyzer",
    section: "Conversations",
    component: "Diff View"
  },
  "analyzer.analytics.pane": {
    tool: "Analyzer",
    section: "Analytics",
    component: "Analytics Pane"
  },
  "analyzer.analytics.outcome-modal": {
    tool: "Analyzer",
    section: "Analytics",
    component: "Outcome Modal"
  },
  "analyzer.projects.pane": {
    tool: "Analyzer",
    section: "Projects",
    component: "Projects Pane"
  },
  "analyzer.share.pane": {
    tool: "Analyzer",
    section: "Share",
    component: "Share Pane"
  },
  "analyzer.share.field-tree": {
    tool: "Analyzer",
    section: "Share",
    component: "Field Tree"
  },
  "analyzer.share.research-profile-selector": {
    tool: "Analyzer",
    section: "Share",
    component: "Research Profile Selector"
  },
  "analyzer.share.chat-viewer": {
    tool: "Analyzer",
    section: "Share",
    component: "Chat Viewer"
  },
  "analyzer.share.diff-view": {
    tool: "Analyzer",
    section: "Share",
    component: "Diff View"
  },
  "analyzer.docs.pane": {
    tool: "Analyzer",
    section: "Docs",
    component: "Documentation Pane"
  },
  "analyzer.docs.markdown-renderer": {
    tool: "Analyzer",
    section: "Docs",
    component: "Markdown Renderer"
  },
  "analyzer.settings.pane": {
    tool: "Analyzer",
    section: "Settings",
    component: "Settings Pane"
  },
  "analyzer.settings.reference-pane": {
    tool: "Analyzer",
    section: "Settings",
    component: "Reference Pane"
  },
  "analyzer.settings.audit-log": {
    tool: "Analyzer",
    section: "Settings",
    component: "Audit Log"
  },
  "analyzer.settings.toast": {
    tool: "Analyzer",
    section: "Settings",
    component: "Toast"
  },
  "analyzer.settings.info-tooltip": {
    tool: "Analyzer",
    section: "Settings",
    component: "Info Tooltip"
  },
  "analyzer.settings.storage-info": {
    tool: "Analyzer",
    section: "Settings",
    component: "Storage Info"
  },
  "static.share.pane": {
    tool: "Static Site",
    section: "Share",
    component: "Share Pane"
  }
} as const satisfies Record<string, UiComponentDescriptor>;

export type ComponentId = keyof typeof UI_COMPONENTS;

export function getComponentDescriptor(id: ComponentId): UiComponentDescriptor {
  return UI_COMPONENTS[id];
}

export function formatComponentName(descriptor: UiComponentDescriptor): string {
  return `${descriptor.tool}:${descriptor.section}:${descriptor.component}`;
}

export function getComponentLabel(id: ComponentId): string {
  return formatComponentName(UI_COMPONENTS[id]);
}
