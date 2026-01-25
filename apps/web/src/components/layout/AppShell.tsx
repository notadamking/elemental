import { useState, useCallback } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { CommandPalette } from '../navigation';
import { useRealtimeEvents } from '../../api/hooks/useRealtimeEvents';
import { useQuery } from '@tanstack/react-query';
import { useGlobalKeyboardShortcuts, useKeyboardShortcut } from '../../hooks';
import type { ConnectionState } from '../../api/websocket';

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
  websocket?: {
    clients: number;
    broadcasting: boolean;
  };
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 30000,
  });
}

function ConnectionStatus({ wsState, health }: { wsState: ConnectionState; health: ReturnType<typeof useHealth> }) {
  if (wsState === 'connecting' || wsState === 'reconnecting') {
    return (
      <div className="flex items-center gap-2 text-yellow-600">
        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-sm">{wsState === 'connecting' ? 'Connecting...' : 'Reconnecting...'}</span>
      </div>
    );
  }

  if (wsState === 'connected') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-sm">Live</span>
      </div>
    );
  }

  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
        <span className="text-sm">Connecting...</span>
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-sm">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-orange-500">
      <div className="w-2 h-2 rounded-full bg-orange-400" />
      <span className="text-sm">Polling</span>
    </div>
  );
}

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const health = useHealth();
  const { connectionState } = useRealtimeEvents({ channels: ['*'] });

  // Initialize global keyboard shortcuts (G T, G P, etc.)
  useGlobalKeyboardShortcuts();

  // Toggle sidebar with Cmd+B
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);
  useKeyboardShortcut('Cmd+B', toggleSidebar, 'Toggle sidebar');

  return (
    <div className="flex h-screen bg-gray-50" data-testid="app-shell">
      <CommandPalette />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between h-14 px-6 bg-white border-b border-gray-200">
          <div>{/* Breadcrumbs will go here */}</div>
          <ConnectionStatus wsState={connectionState} health={health} />
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
