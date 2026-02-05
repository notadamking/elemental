/**
 * @elemental/ui
 *
 * Shared UI components, design tokens, and hooks for Elemental platform.
 *
 * Usage:
 * - Import components: import { Button, Dialog, Card } from '@elemental/ui'
 * - Import layout: import { AppShell, Sidebar, MobileDrawer } from '@elemental/ui'
 * - Import domain: import { TaskCard, EntityCard, TaskStatusBadge } from '@elemental/ui/domain'
 * - Import hooks: import { useTheme, useIsMobile, useWebSocket, useSSEStream } from '@elemental/ui'
 * - Import API clients: import { WebSocketClient, SSEClient, ApiClient } from '@elemental/ui/api'
 * - Import design tokens CSS: import '@elemental/ui/styles/tokens.css'
 */

// Components
export * from './components';

// Layout Components
export * from './layout';

// Domain Components (also available via '@elemental/ui/domain')
export * from './domain';

// Visualization Components (also available via '@elemental/ui/visualizations')
export * from './visualizations';

// Hooks
export * from './hooks';

// Contexts (also available via '@elemental/ui/contexts')
export * from './contexts';

// API Clients (also available via '@elemental/ui/api')
export * from './api';

// Plans Module (also available via '@elemental/ui/plans')
export * from './plans';

// Settings Module (also available via '@elemental/ui/settings')
export * from './settings';

// Documents Module (also available via '@elemental/ui/documents')
export * from './documents';
