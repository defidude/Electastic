import type { ComponentProps } from "react";
import ConfigPanel from "./ConfigPanel";
import AdminPanel from "./AdminPanel";

type Props = ComponentProps<typeof ConfigPanel> & ComponentProps<typeof AdminPanel>;

export default function SettingsPanel(props: Props) {
  return (
    <div className="h-full flex gap-6">
      {/* Left column — Device Configuration */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-4 border-r border-gray-700">
        <h2 className="text-lg font-semibold text-gray-200 mb-3 sticky top-0 bg-gray-900 pb-2 z-10">
          Device Configuration
        </h2>
        <ConfigPanel
          onSetConfig={props.onSetConfig}
          onCommit={props.onCommit}
          onSetChannel={props.onSetChannel}
          onClearChannel={props.onClearChannel}
          channelConfigs={props.channelConfigs}
          isConnected={props.isConnected}
        />
      </div>

      {/* Right column — Administration */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-2">
        <h2 className="text-lg font-semibold text-gray-200 mb-3 sticky top-0 bg-gray-900 pb-2 z-10">
          Administration
        </h2>
        <AdminPanel
          nodes={props.nodes}
          messageCount={props.messageCount}
          onReboot={props.onReboot}
          onShutdown={props.onShutdown}
          onFactoryReset={props.onFactoryReset}
          onResetNodeDb={props.onResetNodeDb}
          onTraceRoute={props.onTraceRoute}
          onRemoveNode={props.onRemoveNode}
          isConnected={props.isConnected}
        />
      </div>
    </div>
  );
}
