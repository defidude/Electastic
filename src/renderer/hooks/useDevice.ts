import { useState, useCallback, useRef, useEffect } from "react";
import type { MeshDevice } from "@meshtastic/core";
import { createConnection, safeDisconnect } from "../lib/connection";
import type {
  ConnectionType,
  DeviceState,
  ChatMessage,
  MeshNode,
  TelemetryPoint,
} from "../lib/types";

const MAX_TELEMETRY_POINTS = 50;
const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function useDevice() {
  const deviceRef = useRef<MeshDevice | null>(null);
  // Use a ref for nodes so event callbacks always see the latest value
  const nodesRef = useRef<Map<number, MeshNode>>(new Map());
  // Track polling interval for node refresh
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track event unsubscribe functions for cleanup
  const unsubscribesRef = useRef<Array<() => void>>([]);

  const [state, setState] = useState<DeviceState>({
    status: "disconnected",
    myNodeNum: 0,
    connectionType: null,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nodes, setNodes] = useState<Map<number, MeshNode>>(new Map());
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [channels, setChannels] = useState<
    Array<{ index: number; name: string }>
  >([{ index: 0, name: "Primary" }]);
  const [channelConfigs, setChannelConfigs] = useState<
    Array<{ index: number; name: string; role: number; psk: Uint8Array }>
  >([]);

  // Keep nodesRef in sync with state
  const updateNodes = useCallback(
    (updater: (prev: Map<number, MeshNode>) => Map<number, MeshNode>) => {
      setNodes((prev) => {
        const next = updater(prev);
        nodesRef.current = next;
        return next;
      });
    },
    []
  );

  // Compact display name: short_name, truncated long_name, or hex ID
  const getNodeName = useCallback((nodeNum: number): string => {
    const node = nodesRef.current.get(nodeNum);
    if (node?.short_name) return node.short_name;
    if (node?.long_name)
      return node.long_name.length > 7
        ? node.long_name.slice(0, 7)
        : node.long_name;
    return `!${nodeNum.toString(16)}`;
  }, []);

  // Extended label: short_name + hex suffix, long_name, or hex fallback.
  // Used in the header for the connected node display.
  const getFullNodeLabel = useCallback((nodeNum: number): string => {
    const node = nodesRef.current.get(nodeNum);
    const hexId = `!${nodeNum.toString(16)}`;
    if (node?.short_name) {
      // Avoid double-appending hex if short_name already contains it
      return node.short_name.includes(hexId)
        ? node.short_name
        : `${node.short_name} ${hexId}`;
    }
    if (node?.long_name) return node.long_name;
    return hexId;
  }, []);

  // ─── Helper: start polling for node updates ─────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) return; // Already polling
    pollRef.current = setInterval(() => {
      // Broadcast position request to all nodes
      deviceRef.current?.requestPosition(0xffffffff).catch(() => {});
    }, POLL_INTERVAL_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ─── Helper: clean up all event subscriptions ───────────────────
  const cleanupSubscriptions = useCallback(() => {
    for (const unsub of unsubscribesRef.current) {
      try { unsub(); } catch { /* ignore */ }
    }
    unsubscribesRef.current = [];
  }, []);

  // Load saved data from DB on mount
  useEffect(() => {
    window.electronAPI.db.getMessages(undefined, 500).then((msgs) => {
      setMessages(msgs.reverse());
    });
    window.electronAPI.db.getNodes().then((savedNodes) => {
      const nodeMap = new Map<number, MeshNode>();
      for (const n of savedNodes) {
        nodeMap.set(n.node_id, n);
      }
      nodesRef.current = nodeMap;
      setNodes(nodeMap);
    });
  }, []);

  const connect = useCallback(
    async (type: ConnectionType, httpAddress?: string) => {
      // Force-disconnect stale device before creating a new connection
      if (deviceRef.current) {
        cleanupSubscriptions();
        stopPolling();
        const oldDevice = deviceRef.current;
        deviceRef.current = null;
        safeDisconnect(oldDevice).catch(() => {});
      }

      setState((s) => ({ ...s, status: "connecting", connectionType: type }));

      try {
        const device = await createConnection(type, httpAddress);
        deviceRef.current = device;

        // Track whether the device reached "configured" state.
        // During initial config the device may briefly report status 2
        // (disconnected) before recovery — we only want to tear down
        // subscriptions on a REAL disconnect (after being configured).
        let wasConfigured = false;

        // ─── Device status ─────────────────────────────────────────
        const unsub1 = device.events.onDeviceStatus.subscribe((status) => {
          const statusMap: Record<number, DeviceState["status"]> = {
            1: "connecting",   // DeviceRestarting
            2: "disconnected", // DeviceDisconnected
            3: "connecting",   // DeviceConnecting
            4: "connecting",   // DeviceReconnecting
            5: "connected",    // DeviceConnected
            6: "connecting",   // DeviceConfiguring
            7: "configured",   // DeviceConfigured
          };
          const mapped = statusMap[status] ?? "connected";
          setState((s) => ({ ...s, status: mapped }));

          // Start polling when configured
          if (status === 7) {
            wasConfigured = true;
            startPolling();
          }

          // Only tear down on a REAL disconnect (after the device was configured).
          // During initial config, transient status-2 events are ignored.
          if (status === 2 && wasConfigured) {
            cleanupSubscriptions();
            stopPolling();
            deviceRef.current = null;
            setState((s) => ({
              ...s,
              status: "disconnected",
              connectionType: null,
            }));
          }
        });
        unsubscribesRef.current.push(unsub1);

        // ─── My node info ──────────────────────────────────────────
        const unsub2 = device.events.onMyNodeInfo.subscribe((info) => {
          setState((s) => ({ ...s, myNodeNum: info.myNodeNum }));
          // Ensure own node is in the map so getNodeName resolves (Fix 13)
          updateNodes((prev) => {
            if (prev.has(info.myNodeNum)) return prev;
            const updated = new Map(prev);
            updated.set(info.myNodeNum, emptyNode(info.myNodeNum));
            return updated;
          });
        });
        unsubscribesRef.current.push(unsub2);

        // ─── Text messages ─────────────────────────────────────────
        const unsub3 = device.events.onMessagePacket.subscribe((packet) => {
          const myNum = device.myNodeInfo?.myNodeNum;
          const isEcho = packet.from === myNum;
          // Check for emoji reaction (tapback) fields on the packet
          const pkt = packet as typeof packet & { emoji?: number; replyId?: number };
          const msg: ChatMessage = {
            sender_id: packet.from,
            sender_name: getNodeName(packet.from),
            payload: packet.data as string,
            channel: packet.channel ?? 0,
            timestamp: packet.rxTime?.getTime() ?? Date.now(),
            // All messages get packetId for reaction targeting; own echoes also get "sending" status
            packetId: packet.id,
            status: isEcho ? "sending" : undefined,
            emoji: pkt.emoji || undefined,
            replyId: pkt.replyId || undefined,
          };
          setMessages((prev) => [...prev, msg]);
          window.electronAPI.db.saveMessage(msg);
        });
        unsubscribesRef.current.push(unsub3);

        // ─── User info (node identity) ─────────────────────────────
        const unsub4 = device.events.onUserPacket.subscribe((packet) => {
          const user = packet.data as {
            id?: string;
            longName?: string;
            shortName?: string;
            hwModel?: number;
          };
          updateNodes((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(packet.from) || emptyNode(packet.from);
            const node: MeshNode = {
              ...existing,
              node_id: packet.from,
              long_name: user.longName ?? existing.long_name,
              short_name: user.shortName ?? existing.short_name,
              hw_model: String(user.hwModel ?? existing.hw_model),
              last_heard: Date.now(),
            };
            updated.set(packet.from, node);
            window.electronAPI.db.saveNode(node);
            return updated;
          });
        });
        unsubscribesRef.current.push(unsub4);

        // ─── Node info packets ─────────────────────────────────────
        const unsub5 = device.events.onNodeInfoPacket.subscribe((packet) => {
          const info = packet as {
            num?: number;
            user?: {
              longName?: string;
              shortName?: string;
              hwModel?: number;
            };
            snr?: number;
            position?: { latitudeI?: number; longitudeI?: number };
            deviceMetrics?: { batteryLevel?: number };
            lastHeard?: number;
          };
          if (!info.num) return;
          const nodeNum = info.num;

          updateNodes((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(nodeNum) || emptyNode(nodeNum);
            const node: MeshNode = {
              ...existing,
              node_id: nodeNum,
              long_name: info.user?.longName ?? existing.long_name,
              short_name: info.user?.shortName ?? existing.short_name,
              hw_model: String(info.user?.hwModel ?? existing.hw_model),
              snr: info.snr ?? existing.snr,
              battery: info.deviceMetrics?.batteryLevel ?? existing.battery,
              last_heard: (info.lastHeard ?? 0) * 1000 || Date.now(),
              latitude:
                info.position?.latitudeI != null
                  ? info.position.latitudeI / 1e7
                  : existing.latitude,
              longitude:
                info.position?.longitudeI != null
                  ? info.position.longitudeI / 1e7
                  : existing.longitude,
            };
            updated.set(nodeNum, node);
            window.electronAPI.db.saveNode(node);
            return updated;
          });
        });
        unsubscribesRef.current.push(unsub5);

        // ─── Position packets ──────────────────────────────────────
        const unsub6 = device.events.onPositionPacket.subscribe((packet) => {
          const pos = packet.data as {
            latitudeI?: number;
            longitudeI?: number;
          };
          // Fix 10: Use explicit undefined check instead of falsy check
          if (pos.latitudeI === undefined && pos.longitudeI === undefined) return;

          updateNodes((prev) => {
            const updated = new Map(prev);
            // Create placeholder if node isn't in map yet (position may
            // arrive before onNodeInfoPacket for newly-discovered nodes)
            const existing = updated.get(packet.from) || emptyNode(packet.from);

            const node: MeshNode = {
              ...existing,
              latitude:
                pos.latitudeI != null
                  ? pos.latitudeI / 1e7
                  : existing.latitude,
              longitude:
                pos.longitudeI != null
                  ? pos.longitudeI / 1e7
                  : existing.longitude,
              last_heard: Date.now(),
            };
            updated.set(packet.from, node);
            window.electronAPI.db.saveNode(node);
            return updated;
          });
        });
        unsubscribesRef.current.push(unsub6);

        // ─── Telemetry ─────────────────────────────────────────────
        const unsub7 = device.events.onTelemetryPacket.subscribe((packet) => {
          const tel = packet.data as {
            deviceMetrics?: { batteryLevel?: number; voltage?: number };
            variant?: {
              case?: string;
              value?: { batteryLevel?: number; voltage?: number };
            };
          };
          const metrics = tel.deviceMetrics ?? tel.variant?.value;
          if (!metrics) return;

          const point: TelemetryPoint = {
            timestamp: Date.now(),
            batteryLevel: metrics.batteryLevel,
            voltage: metrics.voltage,
          };
          setTelemetry((prev) =>
            [...prev, point].slice(-MAX_TELEMETRY_POINTS)
          );

          // Update node battery if from a known node
          if (metrics.batteryLevel && packet.from) {
            updateNodes((prev) => {
              const updated = new Map(prev);
              const existing = updated.get(packet.from);
              if (existing) {
                updated.set(packet.from, {
                  ...existing,
                  battery: metrics.batteryLevel!,
                  last_heard: Date.now(),
                });
              }
              return updated;
            });
          }
        });
        unsubscribesRef.current.push(unsub7);

        // ─── Channel discovery ─────────────────────────────────────
        const unsub8 = device.events.onChannelPacket.subscribe((channel) => {
          const ch = channel as {
            index?: number;
            settings?: { name?: string; psk?: Uint8Array };
            role?: number;
          };
          if (ch.index === undefined) return;

          // Update simple channels list for chat pill selector (skip disabled)
          if (ch.role !== 0) {
            setChannels((prev) => {
              const existing = prev.findIndex((c) => c.index === ch.index);
              const entry = {
                index: ch.index!,
                name: ch.settings?.name || (ch.index === 0 ? "Primary" : `Channel ${ch.index}`),
              };
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = entry;
                return updated;
              }
              return [...prev, entry].sort((a, b) => a.index - b.index);
            });
          }

          // Update full channel configs for config panel (includes disabled)
          setChannelConfigs((prev) => {
            const existing = prev.findIndex((c) => c.index === ch.index);
            const entry = {
              index: ch.index!,
              name: ch.settings?.name || "",
              role: ch.role ?? 0,
              psk: ch.settings?.psk ?? new Uint8Array([1]),
            };
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = entry;
              return updated;
            }
            return [...prev, entry].sort((a, b) => a.index - b.index);
          });
        });
        unsubscribesRef.current.push(unsub8);

        // ─── SNR/RSSI from mesh packets ────────────────────────────
        const unsub9 = device.events.onMeshPacket.subscribe((packet) => {
          const mp = packet as {
            rxSnr?: number;
            rxRssi?: number;
            from?: number;
          };
          if (!mp.from) return;

          if (mp.rxSnr) {
            updateNodes((prev) => {
              const updated = new Map(prev);
              const existing = updated.get(mp.from!);
              if (existing) {
                updated.set(mp.from!, {
                  ...existing,
                  snr: mp.rxSnr!,
                  last_heard: Date.now(),
                });
              }
              return updated;
            });
          }

          if (mp.rxSnr || mp.rxRssi) {
            setTelemetry((prev) =>
              [
                ...prev,
                {
                  timestamp: Date.now(),
                  snr: mp.rxSnr,
                  rssi: mp.rxRssi,
                },
              ].slice(-MAX_TELEMETRY_POINTS)
            );
          }
        });
        unsubscribesRef.current.push(unsub9);

        // ─── Heartbeat for serial connections ──────────────────────
        if (type === "serial") {
          device.setHeartbeatInterval(60_000);
        }

        // ─── Start configuration AFTER all listeners are wired ────
        // configure() triggers the node/channel/config dump from the
        // device. Must happen after subscriptions so we don't miss packets.
        device.configure();
      } catch (err) {
        console.error("Connection failed:", err);
        cleanupSubscriptions();
        stopPolling();
        deviceRef.current = null;
        setState({
          status: "disconnected",
          myNodeNum: 0,
          connectionType: null,
        });
        throw err;
      }
    },
    [getNodeName, updateNodes, startPolling, stopPolling, cleanupSubscriptions]
  );

  const disconnect = useCallback(async () => {
    // Clean up subscriptions and polling first (Fix 12)
    cleanupSubscriptions();
    stopPolling();

    const device = deviceRef.current;
    deviceRef.current = null;
    if (device) {
      await safeDisconnect(device);
    }
    setState({ status: "disconnected", myNodeNum: 0, connectionType: null });
  }, [cleanupSubscriptions, stopPolling]);

  const sendMessage = useCallback(async (text: string, channel = 0) => {
    if (!deviceRef.current) throw new Error("Not connected");
    try {
      // sendText resolves with packet ID on ACK, rejects on failure (60s timeout)
      const packetId = await deviceRef.current.sendText(
        text,
        "broadcast",
        true,
        channel
      );
      // ACK received — update message status
      setMessages((prev) =>
        prev.map((m) =>
          m.packetId === packetId ? { ...m, status: "acked" as const } : m
        )
      );
      window.electronAPI.db.updateMessageStatus(packetId, "acked");
    } catch (err) {
      // NAK or timeout — extract packet ID and error from rejection
      const pe = err as { id?: number; error?: number };
      const errorName = getRoutingErrorName(pe.error);
      if (pe.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.packetId === pe.id
              ? { ...m, status: "failed" as const, error: errorName }
              : m
          )
        );
        window.electronAPI.db.updateMessageStatus(pe.id, "failed", errorName);
      }
      // Don't re-throw — the echo message is already displayed with failed status
    }
  }, []);

  // Send an emoji reaction (tapback) to a specific message
  // sendText signature: (text, destination, wantAck, channel, replyId, emoji)
  const sendReaction = useCallback(
    async (emoji: number, replyId: number, channel = 0) => {
      if (!deviceRef.current) throw new Error("Not connected");
      await deviceRef.current.sendText("", "broadcast", true, channel, replyId, emoji);
    },
    []
  );

  const setConfig = useCallback(async (config: unknown) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.setConfig(config as never);
  }, []);

  const commitConfig = useCallback(async () => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.commitEditSettings();
  }, []);

  const reboot = useCallback(async (seconds = 2) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.reboot(seconds);
  }, []);

  const shutdown = useCallback(async (seconds = 2) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.shutdown(seconds);
  }, []);

  const factoryReset = useCallback(async () => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.factoryResetDevice();
  }, []);

  const resetNodeDb = useCallback(async () => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.resetNodes();
  }, []);

  const traceRoute = useCallback(async (destination: number) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.traceRoute(destination);
  }, []);

  const requestPosition = useCallback(async (destination: number) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.requestPosition(destination);
  }, []);

  // Broadcast position request to all nodes — triggers position + telemetry responses
  const requestRefresh = useCallback(async () => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.requestPosition(0xffffffff);
  }, []);

  // ─── Channel management ──────────────────────────────────────
  const setDeviceChannel = useCallback(async (channelConfig: {
    index: number;
    role: number;
    settings: { name: string; psk: Uint8Array };
  }) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.setChannel({
      index: channelConfig.index,
      role: channelConfig.role,
      settings: channelConfig.settings,
    } as never);
  }, []);

  const clearChannel = useCallback(async (index: number) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.clearChannel(index);
  }, []);

  // ─── Node management ────────────────────────────────────────
  const removeNode = useCallback(async (nodeNum: number) => {
    if (!deviceRef.current) throw new Error("Not connected");
    await deviceRef.current.removeNodeByNum(nodeNum);
    // Also remove from local state and DB
    updateNodes((prev) => {
      const updated = new Map(prev);
      updated.delete(nodeNum);
      return updated;
    });
    await window.electronAPI.db.deleteNode(nodeNum);
  }, [updateNodes]);

  return {
    state,
    messages,
    nodes,
    telemetry,
    channels,
    channelConfigs,
    connect,
    disconnect,
    sendMessage,
    sendReaction,
    setConfig,
    commitConfig,
    setDeviceChannel,
    clearChannel,
    removeNode,
    reboot,
    shutdown,
    factoryReset,
    resetNodeDb,
    traceRoute,
    requestPosition,
    requestRefresh,
    getNodeName,
    getFullNodeLabel,
  };
}

function emptyNode(nodeId: number): MeshNode {
  return {
    node_id: nodeId,
    long_name: "",
    short_name: "",
    hw_model: "",
    snr: 0,
    battery: 0,
    last_heard: Date.now(),
    latitude: 0,
    longitude: 0,
  };
}

/** Map Meshtastic Routing_Error codes to human-readable names */
function getRoutingErrorName(code?: number): string {
  switch (code) {
    case 0:
      return "Success";
    case 1:
      return "No Route";
    case 2:
      return "Got NAK";
    case 3:
      return "Timeout";
    case 4:
      return "No Interface";
    case 5:
      return "Max Retransmit";
    case 6:
      return "No Channel";
    case 7:
      return "Too Large";
    case 8:
      return "No Response";
    case 32:
      return "Duty Cycle Limit";
    case 33:
      return "Bad Request";
    case 34:
      return "Not Authorized";
    default:
      return code !== undefined ? `Error ${code}` : "Unknown Error";
  }
}
