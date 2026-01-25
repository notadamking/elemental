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
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  shortcut?: string;
  group: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Build the navigation commands
  const commands: CommandItem[] = [
    // Navigation commands
    {
      id: 'nav-dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      action: () => navigate({ to: '/dashboard' }),
      shortcut: 'G H',
      group: 'Navigation',
    },
    {
      id: 'nav-task-flow',
      label: 'Task Flow',
      icon: GitBranch,
      action: () => navigate({ to: '/dashboard/task-flow' }),
      shortcut: 'G F',
      group: 'Navigation',
    },
    {
      id: 'nav-agents',
      label: 'Agent Activity',
      icon: Bot,
      action: () => navigate({ to: '/dashboard/agents' }),
      shortcut: 'G A',
      group: 'Navigation',
    },
    {
      id: 'nav-dependencies',
      label: 'Dependencies',
      icon: Network,
      action: () => navigate({ to: '/dashboard/dependencies' }),
      shortcut: 'G G',
      group: 'Navigation',
    },
    {
      id: 'nav-timeline',
      label: 'Timeline',
      icon: History,
      action: () => navigate({ to: '/dashboard/timeline' }),
      shortcut: 'G L',
      group: 'Navigation',
    },
    {
      id: 'nav-tasks',
      label: 'Tasks',
      icon: CheckSquare,
      action: () => navigate({ to: '/tasks', search: { page: 1, limit: 25 } }),
      shortcut: 'G T',
      group: 'Navigation',
    },
    {
      id: 'nav-plans',
      label: 'Plans',
      icon: Folder,
      action: () => navigate({ to: '/plans' }),
      shortcut: 'G P',
      group: 'Navigation',
    },
    {
      id: 'nav-workflows',
      label: 'Workflows',
      icon: Workflow,
      action: () => navigate({ to: '/workflows' }),
      shortcut: 'G W',
      group: 'Navigation',
    },
    {
      id: 'nav-messages',
      label: 'Messages',
      icon: MessageSquare,
      action: () => navigate({ to: '/messages' }),
      shortcut: 'G M',
      group: 'Navigation',
    },
    {
      id: 'nav-documents',
      label: 'Documents',
      icon: FileText,
      action: () => navigate({ to: '/documents' }),
      shortcut: 'G D',
      group: 'Navigation',
    },
    {
      id: 'nav-entities',
      label: 'Entities',
      icon: Users,
      action: () => navigate({ to: '/entities', search: { selected: undefined } }),
      shortcut: 'G E',
      group: 'Navigation',
    },
    {
      id: 'nav-teams',
      label: 'Teams',
      icon: UsersRound,
      action: () => navigate({ to: '/teams' }),
      shortcut: 'G R',
      group: 'Navigation',
    },
    {
      id: 'nav-settings',
      label: 'Settings',
      icon: Settings,
      action: () => navigate({ to: '/settings' }),
      group: 'Navigation',
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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        data-testid="command-palette-backdrop"
      />

      {/* Dialog */}
      <div className="absolute left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg">
        <Command
          className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        >
          <div className="flex items-center gap-3 px-4 border-b border-gray-200">
            <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <Command.Input
              placeholder="Type a command or search..."
              className="w-full py-4 text-base outline-none placeholder:text-gray-400"
              data-testid="command-palette-input"
              autoFocus
            />
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 bg-gray-100 rounded">
              esc
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-gray-500">
              No results found.
            </Command.Empty>

            {Object.entries(groupedCommands).map(([group, items]) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500"
              >
                {items.map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <Command.Item
                      key={cmd.id}
                      value={cmd.label}
                      onSelect={() => handleSelect(cmd)}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-gray-700 aria-selected:bg-blue-50 aria-selected:text-blue-700"
                      data-testid={`command-item-${cmd.id}`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.shortcut && (
                        <kbd className="text-xs text-gray-400 font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
