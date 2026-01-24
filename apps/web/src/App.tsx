import { useQuery } from '@tanstack/react-query';

interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
}

interface StatsResponse {
  totalElements: number;
  elementsByType: Record<string, number>;
  totalDependencies: number;
  totalEvents: number;
  readyTasks: number;
  blockedTasks: number;
  databaseSize: number;
  computedAt: string;
}

function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/health');
      if (!response.ok) throw new Error('Failed to fetch health');
      return response.json();
    },
    refetchInterval: 5000,
  });
}

function useStats() {
  return useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await fetch('/api/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    refetchInterval: 5000,
  });
}

function ConnectionStatus({ health }: { health: ReturnType<typeof useHealth> }) {
  if (health.isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500">
        <div className="w-3 h-3 rounded-full bg-gray-400 animate-pulse" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (health.isError) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <span>Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-green-600">
      <div className="w-3 h-3 rounded-full bg-green-500" />
      <span>Connected</span>
    </div>
  );
}

function StatsCard({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

function App() {
  const health = useHealth();
  const stats = useStats();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Elemental</h1>
          <ConnectionStatus health={health} />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-lg font-medium text-gray-900 mb-6">System Overview</h2>

        {stats.isLoading && (
          <div className="text-gray-500">Loading stats...</div>
        )}

        {stats.isError && (
          <div className="text-red-600">Failed to load stats</div>
        )}

        {stats.data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard
              title="Total Elements"
              value={stats.data.totalElements}
            />
            <StatsCard
              title="Ready Tasks"
              value={stats.data.readyTasks}
              subtitle="Available to work on"
            />
            <StatsCard
              title="Blocked Tasks"
              value={stats.data.blockedTasks}
              subtitle="Waiting on dependencies"
            />
            <StatsCard
              title="Total Events"
              value={stats.data.totalEvents}
              subtitle="In audit log"
            />
          </div>
        )}

        {/* Element Types Breakdown */}
        {stats.data && Object.keys(stats.data.elementsByType).length > 0 && (
          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">Elements by Type</h3>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="space-y-3">
                {Object.entries(stats.data.elementsByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-gray-700 capitalize">{type}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Server Info */}
        {health.data && (
          <div className="mt-8">
            <h3 className="text-md font-medium text-gray-900 mb-4">Server Info</h3>
            <div className="bg-white rounded-lg shadow p-6">
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Database</dt>
                  <dd className="font-mono text-sm text-gray-700">{health.data.database}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">Last Updated</dt>
                  <dd className="text-gray-700">{new Date(health.data.timestamp).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
