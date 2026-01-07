/**
 * Shared UI components for the agentwatch contribution interface.
 */

// Main contribution component (from contrib module)
export { ContribPane, type ContribPaneProps } from "./contrib";

// Re-export contrib sub-components for advanced usage
export {
  Section,
  type SectionProps,
  RedactionConfig,
  type RedactionConfigProps,
  FieldSelector,
  type FieldSelectorProps,
  PreviewPanel,
  type PreviewPanelProps,
  ContributorInfo,
  type ContributorInfoProps
} from "./contrib";

// Utility functions
export * from "./contrib/utils";

// Shared components
export { DiffView, type DiffViewProps } from "./DiffView";
export {
  Tooltip,
  HelpIcon,
  InfoBox,
  ExportSummary,
  GettingStartedGuide,
  ReviewChecklist,
  HELP_CONTENT
} from "./HelpText";
export {
  MarkdownRenderer,
  markdownStyles,
  type MarkdownRendererProps
} from "./MarkdownRenderer";
export {
  ChatViewer,
  ChatViewerModal,
  type ChatViewerProps,
  type ChatViewerModalProps,
  type ChatTranscript,
  type ChatMessage
} from "./ChatViewer";
export {
  SelfDocumentingSection,
  useSelfDocumentingVisible,
  getSelfDocumentingPreference,
  setSelfDocumentingPreference
} from "./SelfDocumentingSection";
