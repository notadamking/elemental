# Web App Patterns

## Files
- **Entry**: `apps/web/src/main.tsx`
- **App shell**: `apps/web/src/App.tsx`
- **Router**: `apps/web/src/router.tsx`
- **API hooks**: `apps/web/src/api/hooks/`
- **Components**: `apps/web/src/components/`
- **Routes**: `apps/web/src/routes/`
- **Custom hooks**: `apps/web/src/hooks/`

## Adding a Page

1. Create route component in `apps/web/src/routes/{feature}.tsx`:

```typescript
export default function FeaturePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Feature</h1>
      {/* Page content */}
    </div>
  );
}
```

2. Register in `apps/web/src/router.tsx`:

```typescript
import FeaturePage from './routes/feature';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // ... existing routes
      { path: 'feature', element: <FeaturePage /> },
    ],
  },
]);
```

3. Add sidebar link in `apps/web/src/components/layout/Sidebar.tsx`

## Adding an API Hook

Create in `apps/web/src/api/hooks/use{Feature}.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = 'http://localhost:3456/api';

export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/features`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateFeatureInput) => {
      const res = await fetch(`${API_BASE}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features'] });
    },
  });
}
```

Export hooks directly from their source files.

## Available Data Hooks

Pre-built hooks in `apps/web/src/api/hooks/useAllElements.ts`:

```typescript
// Main hook: loads ALL elements on app mount
const { data } = useAllElements();  // Returns AllElementsResponse with all types

// Type-specific hooks (derived from useAllElements cache)
const { data: tasks } = useAllTasks();
const { data: plans } = useAllPlans();
const { data: workflows } = useAllWorkflows();
const { data: entities } = useAllEntities();
const { data: documents } = useAllDocuments();
const { data: channels } = useAllChannels();
const { data: messages } = useAllMessages();
const { data: teams } = useAllTeams();
const { data: libraries } = useAllLibraries();

// Enable in-place cache updates from WebSocket events
const handleEvent = useInPlaceCacheUpdates();  // Returns (event) => boolean

// Get WebSocket connection state without event subscription
const connectionState = useWebSocketState();  // Returns 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// Cache manipulation utilities (for programmatic updates)
updateElementInCache(queryClient, element);     // Update element in cache
removeElementFromCache(queryClient, elementId); // Remove element from cache
handleWebSocketEventInPlace(queryClient, event); // Process WS event
```

**Note:** Type-specific hooks derive from `useAllElements` cache - no separate network requests.

## Adding a Component

### UI Primitive (reusable across features)
Location: `apps/web/src/components/ui/`

```typescript
// apps/web/src/components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = 'primary', children, onClick }: ButtonProps) {
  return (
    <button
      className={cn('px-4 py-2 rounded', variants[variant])}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

### Feature Component
Location: `apps/web/src/components/{feature}/`

### Shared Component
Location: `apps/web/src/components/shared/`

## Styling

Uses Tailwind CSS + Shadcn/ui patterns:

```typescript
import { cn } from '@/lib/utils';

<div className={cn(
  'flex items-center gap-2',
  isActive && 'bg-accent',
  className
)} />
```

## Real-time Updates

Use the WebSocket hook for real-time updates:

```typescript
import { useRealtimeEvents } from '@/api/hooks/useRealtimeEvents';

function MyComponent() {
  useRealtimeEvents({
    onElementCreated: (element) => {
      // Handle new element
    },
    onElementUpdated: (element) => {
      // Handle update
    },
  });
}
```

## Running the Web App

```bash
cd apps/web
bun run dev    # Development with HMR
bun run build  # Production build
```

Default port: `5173`
