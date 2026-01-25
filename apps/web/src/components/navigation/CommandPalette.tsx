import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from '@tanstack/react-router';
import {
  LayoutDashboard,
  CheckSquare,
  Folder,
  Workflow,
  MessageSquare,
  FileText,
  Users,
  UsersRound,
  Settings,
  GitBranch,
  Bot,
  Network,
  History,
  Search,
  Command as CommandIcon,
  type LucideIcon,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  action: () => void;
  shortcut?: string;
  group: string;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Build the navigation commands
  const commands: CommandItem[] = [
    // Dashboard section
    {
      id: 'nav-dashboard',
      label: 'Go to Dashboard',
      icon: LayoutDashboard,
      action: () => navigate({ to: '/dashboard' }),
      shortcut: 'G H',
      group: 'Dashboard',
      keywords: ['overview', 'home'],
    },
    {
      id: 'nav-task-flow',
      label: 'Go to Task Flow',
      icon: GitBranch,
      action: () => navigate({ to: '/dashboard/task-flow' }),
      shortcut: 'G F',
      group: 'Dashboard',
      keywords: ['ready', 'blocked', 'progress'],
    },
    {
      id: 'nav-agents',
      label: 'Go to Agent Activity',
      icon: Bot,
      action: () => navigate({ to: '/dashboard/agents' }),
      shortcut: 'G A',
      group: 'Dashboard',
      keywords: ['entities', 'ai', 'workload'],
    },
    {
      id: 'nav-dependencies',
      label: 'Go to Dependencies',
      icon: Network,
      action: () => navigate({ to: '/dashboard/dependencies' }),
      shortcut: 'G G',
      group: 'Dashboard',
      keywords: ['graph', 'blocks', 'relationships'],
    },
    {
      id: 'nav-timeline',
      label: 'Go to Timeline',
      icon: History,
      action: () => navigate({ to: '/dashboard/timeline', search: { page: 1, limit: 100 } }),
      shortcut: 'G L',
      group: 'Dashboard',
      keywords: ['events', 'history', 'activity'],
    },
    // Work section
    {
      id: 'nav-tasks',
      label: 'Go to Tasks',
      icon: CheckSquare,
      action: () => navigate({ to: '/tasks', search: { page: 1, limit: 25 } }),
      shortcut: 'G T',
      group: 'Work',
      keywords: ['todo', 'items', 'list'],
    },
    {
      id: 'nav-plans',
      label: 'Go to Plans',
      icon: Folder,
      action: () => navigate({ to: '/plans' }),
      shortcut: 'G P',
      group: 'Work',
      keywords: ['epic', 'project', 'collection'],
    },
    {
      id: 'nav-workflows',
      label: 'Go to Workflows',
      icon: Workflow,
      action: () => navigate({ to: '/workflows' }),
      shortcut: 'G W',
      group: 'Work',
      keywords: ['automation', 'pour', 'playbook'],
    },
    // Collaborate section
    {
      id: 'nav-messages',
      label: 'Go to Messages',
      icon: MessageSquare,
      action: () => navigate({ to: '/messages', search: { channel: undefined, message: undefined, page: 1, limit: 50 } }),
      shortcut: 'G M',
      group: 'Collaborate',
      keywords: ['chat', 'channels', 'communication'],
    },
    {
      id: 'nav-documents',
      label: 'Go to Documents',
      icon: FileText,
      action: () => navigate({ to: '/documents', search: { selected: undefined, library: undefined, page: 1, limit: 25 } }),
      shortcut: 'G D',
      group: 'Collaborate',
      keywords: ['files', 'notes', 'library'],
    },
    // Organize section
    {
      id: 'nav-entities',
      label: 'Go to Entities',
      icon: Users,
      action: () => navigate({ to: '/entities', search: { selected: undefined, name: undefined, page: 1, limit: 25 } }),
      shortcut: 'G E',
      group: 'Organize',
      keywords: ['people', 'agents', 'humans'],
    },
    {
      id: 'nav-teams',
      label: 'Go to Teams',
      icon: UsersRound,
      action: () => navigate({ to: '/teams', search: { selected: undefined, page: 1, limit: 25 } }),
      shortcut: 'G R',
      group: 'Organize',
      keywords: ['groups', 'members'],
    },
    // Settings
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      icon: Settings,
      action: () => navigate({ to: '/settings' }),
      group: 'Settings',
      keywords: ['preferences', 'config'],
    },
  ];

  // Group commands by their group
  const groupedCommands = commands.reduce((acc, cmd) => {
    if (!acc[cmd.group]) {
      acc[cmd.group] = [];
    }
    acc[cmd.group].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  const groupOrder = ['Dashboard', 'Work', 'Collaborate', 'Organize', 'Settings'];

  // Handle keyboard shortcut to open command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback((command: CommandItem) => {
    setOpen(false);
    command.action();
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50" data-testid="command-palette">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[var(--color-bg-overlay)] backdrop-blur-sm"
        onClick={() => setOpen(false)}
        data-testid="command-palette-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl px-4">
        <Command
          className="bg-[var(--color-surface)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        >
          {/* Search header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 text-[var(--color-text-tertiary)]">
              <CommandIcon className="w-4 h-4" />
              <Search className="w-5 h-5" />
            </div>
            <Command.Input
              placeholder="Search commands..."
              className="w-full py-1 text-lg bg-transparent outline-none placeholder:text-[var(--color-text-muted)] text-[var(--color-text)]"
              data-testid="command-palette-input"
              autoFocus
            />
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded-md border border-[var(--color-border-secondary)]">
              esc
            </kbd>
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto p-2">
            <Command.Empty className="py-10 text-center">
              <div className="text-[var(--color-text-tertiary)] text-sm">No results found.</div>
              <div className="text-[var(--color-text-muted)] text-xs mt-1">Try a different search term</div>
            </Command.Empty>

            {groupOrder.map((group) => {
              const items = groupedCommands[group];
              if (!items) return null;

              return (
                <Command.Group
                  key={group}
                  heading={group}
                  className="mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--color-text-tertiary)] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {items.map((cmd) => {
                    const Icon = cmd.icon;
                    return (
                      <Command.Item
                        key={cmd.id}
                        value={`${cmd.label} ${cmd.keywords?.join(' ') || ''}`}
                        onSelect={() => handleSelect(cmd)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[var(--color-text-secondary)] transition-colors duration-100 aria-selected:bg-[var(--color-surface-selected)] aria-selected:text-[var(--color-text)] group"
                        data-testid={`command-item-${cmd.id}`}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--color-surface-hover)] group-aria-selected:bg-[var(--color-primary-muted)] transition-colors">
                          <Icon className="w-4 h-4 text-[var(--color-text-tertiary)] group-aria-selected:text-[var(--color-primary-text)]" />
                        </div>
                        <span className="flex-1 font-medium">{cmd.label}</span>
                        {cmd.shortcut && (
                          <div className="flex items-center gap-1">
                            {cmd.shortcut.split(' ').map((key, i) => (
                              <kbd
                                key={i}
                                className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-hover)] rounded border border-[var(--color-border-secondary)] min-w-[20px] text-center"
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              );
            })}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↑</kbd>
                <kbd className="px-1 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">↵</kbd>
                to select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--color-surface-hover)] rounded text-[10px] font-mono">⌘K</kbd>
              to toggle
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
