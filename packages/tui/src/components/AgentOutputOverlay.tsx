import { Box, Text, useInput } from "ink";
import React, { useState, useEffect } from "react";
import type { AgentProcess } from "../types.js";

interface AgentOutputOverlayProps {
  agent: AgentProcess;
  watcherUrl: string;
  columns: number;
  rows: number;
  onClose: () => void;
}

export function AgentOutputOverlay({
  agent,
  watcherUrl,
  columns,
  rows,
  onClose
}: AgentOutputOverlayProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Load output
  useEffect(() => {
    const loadOutput = async () => {
      try {
        const res = await fetch(`${watcherUrl}/api/agents/${agent.pid}/output`);
        if (res.ok) {
          const data = (await res.json()) as { lines: string[] };
          setLines(data.lines);
          // Auto-scroll to bottom on new data
          setScrollOffset(Math.max(0, data.lines.length - (rows - 8)));
        }
      } catch {
        // Ignore errors
      } finally {
        setLoading(false);
      }
    };

    loadOutput();
    const interval = setInterval(loadOutput, 1000);
    return () => clearInterval(interval);
  }, [agent.pid, watcherUrl, rows]);

  // Show temporary message
  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2000);
  };

  // Send signal
  const sendSignal = async (signal: string) => {
    try {
      const res = await fetch(`${watcherUrl}/api/agents/${agent.pid}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal })
      });
      if (res.ok) {
        showMessage(`Sent ${signal}`);
      } else {
        showMessage(`Failed to send ${signal}`);
      }
    } catch {
      showMessage("Error sending signal");
    }
  };

  // Kill agent
  const killAgent = async (force: boolean) => {
    try {
      await fetch(`${watcherUrl}/api/agents/${agent.pid}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      showMessage(force ? "Force killed" : "Terminated");
      setTimeout(onClose, 1000);
    } catch {
      showMessage("Error killing agent");
    }
  };

  // Keyboard input
  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }

    // Signal shortcuts
    if (input === "c" && key.ctrl) {
      sendSignal("interrupt");
      return;
    }
    if (input === "i") {
      sendSignal("interrupt");
      return;
    }
    if (input === "d") {
      sendSignal("eof");
      return;
    }
    if (input === "z") {
      sendSignal("suspend");
      return;
    }

    // Kill shortcuts
    if (input === "k") {
      killAgent(false);
      return;
    }
    if (input === "K") {
      killAgent(true);
      return;
    }

    // Scroll
    if (input === "j" || key.downArrow) {
      setScrollOffset((prev) =>
        Math.min(prev + 1, Math.max(0, lines.length - (rows - 8)))
      );
      return;
    }
    if (input === "k" || key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === "g") {
      setScrollOffset(0);
      return;
    }
    if (input === "G") {
      setScrollOffset(Math.max(0, lines.length - (rows - 8)));
      return;
    }
  });

  const boxWidth = Math.min(columns - 4, 100);
  const boxHeight = rows - 4;
  const startCol = Math.floor((columns - boxWidth) / 2);
  const startRow = 2;
  const visibleLines = boxHeight - 6; // Header + controls

  const visibleSlice = lines.slice(scrollOffset, scrollOffset + visibleLines);

  return (
    <Box
      position="absolute"
      marginTop={startRow}
      marginLeft={startCol}
      flexDirection="column"
      width={boxWidth}
      height={boxHeight}
      borderStyle="round"
      borderColor="cyan"
    >
      {/* Header */}
      <Box paddingX={2} paddingY={1} justifyContent="space-between">
        <Text bold color="cyan">
          {agent.label} <Text color="gray">(PID {agent.pid})</Text>
        </Text>
        {agent.wrapper_state?.awaiting_user && (
          <Text color="yellow"> [Awaiting Input]</Text>
        )}
      </Box>

      {/* Output */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {loading ? (
          <Text color="gray">Loading...</Text>
        ) : lines.length === 0 ? (
          <Text color="gray">No output yet</Text>
        ) : (
          visibleSlice.map((line, i) => (
            <Text key={scrollOffset + i} color="white" wrap="truncate">
              {line || " "}
            </Text>
          ))
        )}
      </Box>

      {/* Status */}
      {message && (
        <Box paddingX={2}>
          <Text color="yellow">{message}</Text>
        </Box>
      )}

      {/* Scroll indicator */}
      {lines.length > visibleLines && (
        <Box paddingX={2}>
          <Text color="gray">
            Line {scrollOffset + 1}-
            {Math.min(scrollOffset + visibleLines, lines.length)} of{" "}
            {lines.length}
          </Text>
        </Box>
      )}

      {/* Controls */}
      <Box
        paddingX={2}
        paddingY={1}
        borderStyle="single"
        borderColor="gray"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
      >
        <Text color="gray">
          <Text color="yellow">i</Text>:Ctrl+C <Text color="yellow">d</Text>
          :Ctrl+D <Text color="yellow">z</Text>:Ctrl+Z{" "}
          <Text color="red">k</Text>:Kill <Text color="red">K</Text>:Force{" "}
          <Text color="cyan">q/Esc</Text>:Close
        </Text>
      </Box>
    </Box>
  );
}
