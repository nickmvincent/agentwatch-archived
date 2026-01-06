import { Box, Text, useApp, useInput, useStdout } from "ink";
import React, { useState, useEffect } from "react";
import { AgentOutputOverlay } from "./components/AgentOutputOverlay.js";
import { AgentPane } from "./components/AgentPane.js";
import { ConfigOverlay } from "./components/ConfigOverlay.js";
import { ContribPane } from "./components/ContribPane.js";
import { Header } from "./components/Header.js";
import { HelpOverlay } from "./components/HelpOverlay.js";
import { HooksPane } from "./components/HooksPane.js";
import { PortsPane } from "./components/PortsPane.js";
import { RepoPane } from "./components/RepoPane.js";
import { StatusBar } from "./components/StatusBar.js";
import { useWatcher } from "./hooks/useWatcher.js";
import type { AgentProcess, RepoStatus } from "./types.js";

interface AppProps {
  watcherUrl: string;
}

type Focus = "agents" | "repos" | "hooks" | "ports" | "contrib";
type View = "main" | "help" | "config" | "output";
type ContribViewMode = "list" | "cost" | "patterns";

export function App({ watcherUrl }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // State
  const [view, setView] = useState<View>("main");
  const [focus, setFocus] = useState<Focus>("agents");
  const [showRepos, setShowRepos] = useState(false);
  const [showHooks, setShowHooks] = useState(false);
  const [showPorts, setShowPorts] = useState(false);
  const [showContrib, setShowContrib] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Selections
  const [agentSelection, setAgentSelection] = useState(0);
  const [repoSelection, setRepoSelection] = useState(0);
  const [hooksSelection, setHooksSelection] = useState(0);
  const [portsSelection, setPortsSelection] = useState(0);
  const [contribSelection, setContribSelection] = useState(0);

  // Contrib state
  const [contribSelectedIds, setContribSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [contribViewMode, setContribViewMode] =
    useState<ContribViewMode>("list");

  // Filters
  const [agentFilter, setAgentFilter] = useState("");
  const [repoFilter, setRepoFilter] = useState("");

  // Grouping
  const [groupAgents, setGroupAgents] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );

  // Data from watcher
  const { connected, agents, repos, hookSessions, ports, error, refresh } =
    useWatcher(watcherUrl, paused);

  // Terminal dimensions
  const [termSize, setTermSize] = useState({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24
  });

  useEffect(() => {
    const updateSize = () => {
      if (stdout) {
        setTermSize({ columns: stdout.columns, rows: stdout.rows });
      }
    };

    stdout?.on("resize", updateSize);
    return () => {
      stdout?.off("resize", updateSize);
    };
  }, [stdout]);

  // Filtered data
  const filteredAgents = agents.filter((a) =>
    agentFilter
      ? a.label.toLowerCase().includes(agentFilter.toLowerCase()) ||
        a.cmdline.toLowerCase().includes(agentFilter.toLowerCase())
      : true
  );

  const filteredRepos = repos.filter((r) =>
    repoFilter
      ? r.name.toLowerCase().includes(repoFilter.toLowerCase()) ||
        r.path.toLowerCase().includes(repoFilter.toLowerCase())
      : true
  );

  // Show temporary message
  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  };

  // Toggle group collapse
  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Keyboard input
  useInput((input, key) => {
    // Help view
    if (view === "help") {
      if (input === "?" || input === "q" || key.escape) {
        setView("main");
      }
      return;
    }

    // Config view
    if (view === "config") {
      if (input === "C" || input === "c" || key.escape) {
        setView("main");
      }
      return;
    }

    // Output view - handled by the overlay
    if (view === "output") {
      return;
    }

    // Global keys
    if (input === "q" || input === "Q") {
      exit();
      return;
    }

    if (input === "?") {
      setView("help");
      return;
    }

    if (input === "C") {
      setView("config");
      return;
    }

    if (input === "p") {
      setPaused(!paused);
      showMessage(paused ? "Resumed" : "Paused");
      return;
    }

    if (input === "r") {
      refresh();
      showMessage("Refreshing...");
      return;
    }

    if (input === "R") {
      setShowRepos(!showRepos);
      if (!showRepos) setFocus("repos");
      return;
    }

    if (input === "H") {
      setShowHooks(!showHooks);
      if (!showHooks) setFocus("hooks");
      return;
    }

    if (input === "P") {
      setShowPorts(!showPorts);
      if (!showPorts) setFocus("ports");
      return;
    }

    if (input === "S") {
      setShowContrib(!showContrib);
      if (!showContrib) setFocus("contrib");
      return;
    }

    if (key.tab) {
      // Cycle through visible panes
      const panes: Focus[] = ["agents"];
      if (showHooks) panes.push("hooks");
      if (showPorts) panes.push("ports");
      if (showContrib) panes.push("contrib");
      if (showRepos) panes.push("repos");

      const currentIdx = panes.indexOf(focus);
      const nextIdx = (currentIdx + 1) % panes.length;
      setFocus(panes[nextIdx] ?? "agents");
      return;
    }

    // Navigation
    let list: unknown[] = filteredAgents;
    let selection = agentSelection;
    let setSelection = setAgentSelection;

    if (focus === "repos" && showRepos) {
      list = filteredRepos;
      selection = repoSelection;
      setSelection = setRepoSelection;
    } else if (focus === "hooks" && showHooks) {
      list = hookSessions;
      selection = hooksSelection;
      setSelection = setHooksSelection;
    } else if (focus === "ports" && showPorts) {
      list = ports;
      selection = portsSelection;
      setSelection = setPortsSelection;
    } else if (focus === "contrib" && showContrib) {
      list = hookSessions;
      selection = contribSelection;
      setSelection = setContribSelection;
    }

    if (input === "j" || key.downArrow) {
      setSelection(Math.min(selection + 1, list.length - 1));
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelection(Math.max(selection - 1, 0));
      return;
    }

    if (input === "g" && !key.shift) {
      if (focus === "agents") {
        setGroupAgents(!groupAgents);
        showMessage(groupAgents ? "Ungrouped" : "Grouped");
      } else {
        setSelection(0);
      }
      return;
    }

    if (input === "G") {
      setSelection(list.length - 1);
      return;
    }

    // Agent-specific keys
    if (focus === "agents" && filteredAgents.length > 0) {
      const agent = filteredAgents[agentSelection];
      if (!agent) return;

      if (input === "e") {
        toggleGroup(agent.label);
        return;
      }

      if (key.return && agent.wrapper_state) {
        setView("output");
        return;
      }
    }

    // Contrib-specific keys
    if (focus === "contrib" && showContrib) {
      if (input === " ") {
        // Toggle session selection
        const session = hookSessions[contribSelection];
        if (session) {
          setContribSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(session.session_id)) {
              next.delete(session.session_id);
            } else {
              next.add(session.session_id);
            }
            return next;
          });
        }
        return;
      }

      if (input === "V" || input === "v") {
        // Cycle view mode
        const modes: ContribViewMode[] = ["list", "cost", "patterns"];
        const currentIdx = modes.indexOf(contribViewMode);
        const nextIdx = (currentIdx + 1) % modes.length;
        setContribViewMode(modes[nextIdx] ?? "list");
        const labels: Record<ContribViewMode, string> = {
          list: "list",
          cost: "tokens",
          patterns: "patterns"
        };
        showMessage(`View: ${labels[modes[nextIdx] ?? "list"]}`);
        return;
      }

      if (input === "a") {
        // Select all
        setContribSelectedIds(new Set(hookSessions.map((s) => s.session_id)));
        showMessage("Selected all");
        return;
      }

      if (input === "n") {
        // Select none
        setContribSelectedIds(new Set());
        showMessage("Deselected all");
        return;
      }

      if (input === "E" || input === "e") {
        // Export (would trigger export flow)
        if (contribSelectedIds.size > 0) {
          showMessage(`Exporting ${contribSelectedIds.size} session(s)...`);
          // TODO: Implement actual export
        } else {
          showMessage("No sessions selected");
        }
        return;
      }
    }
  });

  const mainHeight = termSize.rows - 3; // header + status bar

  // Calculate column widths based on visible panes
  const visiblePanes = [showRepos, showHooks, showPorts, showContrib];
  const getColumnWidth = (isMain = false): string => {
    const count = visiblePanes.filter(Boolean).length + 1; // +1 for main pane
    if (isMain) {
      return count === 1
        ? "100%"
        : count === 2
          ? "50%"
          : count === 3
            ? "33%"
            : count === 4
              ? "25%"
              : "20%";
    }
    return count === 2
      ? "50%"
      : count === 3
        ? "33%"
        : count === 4
          ? "25%"
          : "20%";
  };

  if (!connected && !error) {
    return (
      <Box flexDirection="column" height={termSize.rows}>
        <Header
          connected={false}
          agentCount={0}
          repoCount={0}
          paused={paused}
        />
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text color="yellow">Connecting to watcher at {watcherUrl}...</Text>
        </Box>
        <StatusBar
          focus={focus}
          showRepos={showRepos}
          message={message}
          error={null}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termSize.rows}>
      <Header
        connected={connected}
        agentCount={agents.length}
        repoCount={repos.length}
        paused={paused}
      />

      <Box flexGrow={1} height={mainHeight}>
        {showRepos && (
          <>
            <Box width={getColumnWidth()} flexDirection="column">
              <RepoPane
                repos={filteredRepos}
                selection={repoSelection}
                focused={focus === "repos"}
                filter={repoFilter}
                height={mainHeight}
              />
            </Box>
            <Box width={1}>
              <Text color="gray">│</Text>
            </Box>
          </>
        )}

        {showHooks && (
          <>
            <Box width={getColumnWidth()} flexDirection="column">
              <HooksPane
                sessions={hookSessions}
                selection={hooksSelection}
                focused={focus === "hooks"}
                height={mainHeight}
              />
            </Box>
            <Box width={1}>
              <Text color="gray">│</Text>
            </Box>
          </>
        )}

        {showPorts && (
          <>
            <Box width={getColumnWidth()} flexDirection="column">
              <PortsPane
                ports={ports}
                selection={portsSelection}
                focused={focus === "ports"}
                height={mainHeight}
              />
            </Box>
            <Box width={1}>
              <Text color="gray">│</Text>
            </Box>
          </>
        )}

        {showContrib && (
          <>
            <Box width={getColumnWidth()} flexDirection="column">
              <ContribPane
                sessions={hookSessions}
                selection={contribSelection}
                focused={focus === "contrib"}
                height={mainHeight}
                selectedIds={contribSelectedIds}
                viewMode={contribViewMode}
              />
            </Box>
            <Box width={1}>
              <Text color="gray">│</Text>
            </Box>
          </>
        )}

        <Box width={getColumnWidth(true)} flexDirection="column">
          <AgentPane
            agents={filteredAgents}
            selection={agentSelection}
            focused={focus === "agents"}
            filter={agentFilter}
            groupAgents={groupAgents}
            collapsedGroups={collapsedGroups}
            height={mainHeight}
          />
        </Box>
      </Box>

      <StatusBar
        focus={focus}
        showRepos={showRepos}
        showHooks={showHooks}
        showPorts={showPorts}
        showContrib={showContrib}
        message={message}
        error={error}
      />

      {view === "help" && (
        <HelpOverlay columns={termSize.columns} rows={termSize.rows} />
      )}

      {view === "config" && (
        <ConfigOverlay
          columns={termSize.columns}
          rows={termSize.rows}
          watcherUrl={watcherUrl}
        />
      )}

      {view === "output" && filteredAgents[agentSelection]?.wrapper_state && (
        <AgentOutputOverlay
          agent={filteredAgents[agentSelection]!}
          watcherUrl={watcherUrl}
          columns={termSize.columns}
          rows={termSize.rows}
          onClose={() => setView("main")}
        />
      )}
    </Box>
  );
}
