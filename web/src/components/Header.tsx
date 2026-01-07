import {
  SelfDocumentingSection,
  useSelfDocumentingVisible
} from "./ui/SelfDocumentingSection";

interface HeaderProps {
  connected: boolean;
  repoCount: number;
  agentCount: number;
  loadingTabs?: string[];
}

export function Header({
  connected,
  repoCount,
  agentCount,
  loadingTabs = []
}: HeaderProps) {
  const showSelfDocs = useSelfDocumentingVisible();
  const selfDocs = {
    title: "Header",
    componentId: "analyzer.global.header",
    notes: [
      "Displays watcher connectivity and aggregate counts from props.",
      "Tab loading state is provided by the loading context."
    ]
  };

  return (
    <SelfDocumentingSection {...selfDocs} visible={showSelfDocs}>
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">Agentwatch</h1>
            <span
              className={`px-2 py-1 rounded text-xs ${
                connected
                  ? "bg-green-900 text-green-300"
                  : "bg-red-900 text-red-300"
              }`}
            >
              {connected ? "Connected" : "Disconnected"}
            </span>
            {loadingTabs.length > 0 && (
              <span className="px-2 py-1 rounded text-xs bg-blue-900/50 text-blue-300 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                Loading {loadingTabs.join(", ")}...
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-gray-400 text-sm">
            <span>{repoCount} repos</span>
            <span>{agentCount} agents</span>
          </div>
        </div>
      </header>
    </SelfDocumentingSection>
  );
}
