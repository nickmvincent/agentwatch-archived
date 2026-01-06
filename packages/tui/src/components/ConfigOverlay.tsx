import { Box, Text } from "ink";
import React, { useState, useEffect } from "react";

interface ConfigOverlayProps {
  columns: number;
  rows: number;
  watcherUrl: string;
}

interface ConfigData {
  security_gates: {
    enabled: boolean;
    anomaly_detection: { enabled: boolean };
    test_gate: { enabled: boolean; test_command: string };
  };
  notifications: {
    enable: boolean;
  };
  agents: {
    matchers: Array<{ label: string }>;
  };
  roots: string[];
}

export function ConfigOverlay({
  columns,
  rows,
  watcherUrl
}: ConfigOverlayProps) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch(`${watcherUrl}/api/config`);
        const data = (await res.json()) as ConfigData;
        setConfig(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load config");
      }
    };
    loadConfig();
  }, [watcherUrl]);

  const boxWidth = 50;
  const boxHeight = 20;
  const startCol = Math.floor((columns - boxWidth) / 2);
  const startRow = Math.floor((rows - boxHeight) / 2);

  return (
    <Box
      position="absolute"
      marginTop={startRow}
      marginLeft={startCol}
      flexDirection="column"
      width={boxWidth}
      borderStyle="round"
      borderColor="cyan"
    >
      <Box justifyContent="center" paddingY={1}>
        <Text bold color="cyan">
          Configuration
        </Text>
      </Box>

      {error && (
        <Box paddingX={2}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {config && (
        <>
          <Box paddingX={2}>
            <Text bold color="white">
              Security Gates
            </Text>
          </Box>
          <Box paddingX={2}>
            <Text color="gray">Enabled: </Text>
            <Text color={config.security_gates.enabled ? "green" : "red"}>
              {config.security_gates.enabled ? "Yes" : "No"}
            </Text>
          </Box>
          <Box paddingX={2}>
            <Text color="gray">Anomaly Detection: </Text>
            <Text
              color={
                config.security_gates.anomaly_detection.enabled
                  ? "green"
                  : "red"
              }
            >
              {config.security_gates.anomaly_detection.enabled ? "On" : "Off"}
            </Text>
          </Box>
          <Box paddingX={2}>
            <Text color="gray">Test Gate: </Text>
            <Text
              color={config.security_gates.test_gate.enabled ? "green" : "red"}
            >
              {config.security_gates.test_gate.enabled ? "On" : "Off"}
            </Text>
          </Box>

          <Box height={1} />

          <Box paddingX={2}>
            <Text bold color="white">
              Notifications
            </Text>
          </Box>
          <Box paddingX={2}>
            <Text color="gray">Enabled: </Text>
            <Text color={config.notifications.enable ? "green" : "red"}>
              {config.notifications.enable ? "Yes" : "No"}
            </Text>
          </Box>

          <Box height={1} />

          <Box paddingX={2}>
            <Text bold color="white">
              Agents
            </Text>
          </Box>
          <Box paddingX={2}>
            <Text color="gray">Matchers: </Text>
            <Text color="yellow">
              {config.agents.matchers.map((m) => m.label).join(", ")}
            </Text>
          </Box>

          <Box height={1} />

          <Box paddingX={2}>
            <Text color="gray">Roots: </Text>
            <Text color="white">{config.roots.length} configured</Text>
          </Box>
        </>
      )}

      <Box justifyContent="center" paddingTop={1}>
        <Text color="gray" dimColor>
          Edit ~/.config/agentwatch/config.toml
        </Text>
      </Box>

      <Box justifyContent="center" paddingY={1}>
        <Text color="gray">Press C or Esc to close</Text>
      </Box>
    </Box>
  );
}
