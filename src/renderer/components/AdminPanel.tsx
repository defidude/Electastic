import { useState } from "react";
import type { MeshNode } from "../lib/types";

interface Props {
  nodes: Map<number, MeshNode>;
  messageCount: number;
  onReboot: (seconds: number) => Promise<void>;
  onShutdown: (seconds: number) => Promise<void>;
  onFactoryReset: () => Promise<void>;
  onResetNodeDb: () => Promise<void>;
  onTraceRoute: (destination: number) => Promise<void>;
  onRemoveNode: (nodeNum: number) => Promise<void>;
  isConnected: boolean;
}

export default function AdminPanel({
  nodes,
  messageCount,
  onReboot,
  onShutdown,
  onFactoryReset,
  onResetNodeDb,
  onTraceRoute,
  onRemoveNode,
  isConnected,
}: Props) {
  const [targetNode, setTargetNode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const executeAction = async (
    name: string,
    action: () => Promise<void>
  ) => {
    if (confirmAction !== name) {
      setConfirmAction(name);
      setStatus(`Click "${name}" again to confirm.`);
      setTimeout(() => setConfirmAction(null), 5000);
      return;
    }
    setConfirmAction(null);
    setStatus(`Executing ${name}...`);
    try {
      await action();
      setStatus(`${name} command sent successfully.`);
    } catch (err) {
      setStatus(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };

  const getTargetNodeNum = (): number => {
    if (!targetNode) return 0;
    if (targetNode.startsWith("!")) {
      return parseInt(targetNode.slice(1), 16);
    }
    return parseInt(targetNode, 10);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h2 className="text-xl font-semibold text-gray-200">Administration</h2>

      {!isConnected && (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 px-4 py-2 rounded-lg text-sm">
          Connect to a device to use admin commands.
        </div>
      )}

      {/* Target Node */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">
          Target Node (leave empty for self)
        </label>
        <input
          type="text"
          value={targetNode}
          onChange={(e) => setTargetNode(e.target.value)}
          disabled={!isConnected}
          placeholder="!aabbccdd or node number"
          className="w-full px-3 py-2 bg-gray-700 rounded-lg text-gray-200 border border-gray-600 focus:border-green-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Device Commands */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">Device Commands (affects connected device)</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              executeAction("Reboot", () => onReboot(2))
            }
            disabled={!isConnected}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Reboot"
                ? "bg-yellow-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            } disabled:opacity-50`}
          >
            {confirmAction === "Reboot" ? "Confirm Reboot?" : "Reboot"}
          </button>

          <button
            onClick={() =>
              executeAction("Shutdown", () => onShutdown(2))
            }
            disabled={!isConnected}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Shutdown"
                ? "bg-yellow-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            } disabled:opacity-50`}
          >
            {confirmAction === "Shutdown" ? "Confirm Shutdown?" : "Shutdown"}
          </button>

          <button
            onClick={() =>
              executeAction("Reset NodeDB", () => onResetNodeDb())
            }
            disabled={!isConnected}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Reset NodeDB"
                ? "bg-yellow-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            } disabled:opacity-50`}
          >
            {confirmAction === "Reset NodeDB"
              ? "Confirm Reset?"
              : "Reset NodeDB"}
          </button>

          <button
            onClick={() =>
              executeAction("Factory Reset", () => onFactoryReset())
            }
            disabled={!isConnected}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Factory Reset"
                ? "bg-red-600 text-white"
                : "bg-red-900/50 text-red-300 hover:bg-red-900/70 border border-red-800"
            } disabled:opacity-50`}
          >
            {confirmAction === "Factory Reset"
              ? "CONFIRM FACTORY RESET?"
              : "Factory Reset"}
          </button>
        </div>
      </div>

      {/* Trace Route */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">
          Network Diagnostics
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              const target = getTargetNodeNum();
              if (target) {
                onTraceRoute(target).then(() =>
                  setStatus("Trace route request sent.")
                );
              } else {
                setStatus("Enter a target node for trace route.");
              }
            }}
            disabled={!isConnected || !targetNode}
            className="px-4 py-3 bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
          >
            Trace Route
          </button>

          <button
            onClick={() => {
              const target = getTargetNodeNum();
              if (target) {
                executeAction("Remove Node", () => onRemoveNode(target));
              } else {
                setStatus("Enter a target node to remove.");
              }
            }}
            disabled={!isConnected || !targetNode}
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Remove Node"
                ? "bg-yellow-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            } disabled:opacity-50`}
          >
            {confirmAction === "Remove Node"
              ? "Confirm Remove?"
              : "Remove Node"}
          </button>
        </div>
      </div>

      {/* Data Management */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">
          Data Management
        </h3>
        <p className="text-xs text-gray-500">
          Export your local database (messages &amp; nodes) as a .db file, or
          import/merge another user's database into yours.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={async () => {
              setStatus("Exporting database...");
              try {
                const path = await window.electronAPI.db.exportDb();
                if (path) {
                  setStatus(`Exported to: ${path}`);
                } else {
                  setStatus("Export cancelled.");
                }
              } catch (err) {
                setStatus(
                  `Export failed: ${
                    err instanceof Error ? err.message : "Unknown error"
                  }`
                );
              }
            }}
            className="px-4 py-3 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Export Database
          </button>

          <button
            onClick={async () => {
              setStatus("Importing database...");
              try {
                const result = await window.electronAPI.db.importDb();
                if (result) {
                  setStatus(
                    `Merged: ${result.nodesAdded} new nodes, ${result.messagesAdded} new messages.`
                  );
                } else {
                  setStatus("Import cancelled.");
                }
              } catch (err) {
                setStatus(
                  `Import failed: ${
                    err instanceof Error ? err.message : "Unknown error"
                  }`
                );
              }
            }}
            className="px-4 py-3 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            Import &amp; Merge
          </button>
        </div>
      </div>

      {/* Local Database Actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">
          Local Database
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              executeAction("Clear Messages", async () => {
                await window.electronAPI.db.clearMessages();
              })
            }
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Clear Messages"
                ? "bg-yellow-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {confirmAction === "Clear Messages"
              ? `Clear ${messageCount} messages?`
              : `Clear Messages (${messageCount})`}
          </button>

          <button
            onClick={() =>
              executeAction("Clear Nodes", async () => {
                await window.electronAPI.db.clearNodes();
              })
            }
            className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Clear Nodes"
                ? "bg-yellow-600 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            {confirmAction === "Clear Nodes"
              ? `Clear ${nodes.size} nodes?`
              : `Clear Nodes (${nodes.size})`}
          </button>

          <button
            onClick={() =>
              executeAction("Clear All Data", async () => {
                await window.electronAPI.db.clearMessages();
                await window.electronAPI.db.clearNodes();
                await window.electronAPI.clearSessionData();
              })
            }
            className={`col-span-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              confirmAction === "Clear All Data"
                ? "bg-red-600 text-white"
                : "bg-red-900/50 text-red-300 hover:bg-red-900/70 border border-red-800"
            }`}
          >
            {confirmAction === "Clear All Data"
              ? "CONFIRM CLEAR ALL?"
              : "Clear All Local Data & Cache"}
          </button>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div className="bg-gray-800 px-4 py-2 rounded-lg text-sm text-gray-400">
          {status}
        </div>
      )}

      {/* Warning */}
      <div className="bg-red-900/20 border border-red-900 rounded-lg p-4 text-sm text-red-400 space-y-1">
        <p className="font-medium">Warning</p>
        <p>
          Factory Reset will erase all device settings and restore defaults.
          This action cannot be undone.
        </p>
      </div>
    </div>
  );
}
