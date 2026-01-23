/**
 * CLI Output Formatter
 *
 * Handles formatting output for different modes (human, JSON, quiet).
 */

import type { OutputMode, CommandResult } from './types.js';

// ============================================================================
// Formatter Interface
// ============================================================================

/**
 * Output formatter interface
 */
export interface OutputFormatter {
  /** Format a successful result */
  success(result: CommandResult): string;
  /** Format an error result */
  error(result: CommandResult): string;
  /** Format a table of data */
  table(headers: string[], rows: unknown[][]): string;
  /** Format a single element */
  element(data: Record<string, unknown>): string;
  /** Format a list of elements */
  list(items: Record<string, unknown>[]): string;
  /** Format a tree structure */
  tree(data: TreeNode): string;
}

/**
 * Tree node for hierarchical display
 */
export interface TreeNode {
  label: string;
  children?: TreeNode[];
}

// ============================================================================
// Human Formatter
// ============================================================================

/**
 * Human-readable output formatter
 */
class HumanFormatter implements OutputFormatter {
  success(result: CommandResult): string {
    if (result.message) {
      return result.message;
    }
    if (result.data !== undefined) {
      return formatValue(result.data);
    }
    return '';
  }

  error(result: CommandResult): string {
    return `Error: ${result.error}`;
  }

  table(headers: string[], rows: unknown[][]): string {
    if (rows.length === 0) {
      return 'No results';
    }

    // Calculate column widths
    const widths = headers.map((h, i) => {
      const maxDataWidth = Math.max(...rows.map(r => String(r[i] ?? '').length));
      return Math.max(h.length, maxDataWidth);
    });

    // Build header row
    const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
    const separator = widths.map(w => '-'.repeat(w)).join('  ');

    // Build data rows
    const dataRows = rows.map(row =>
      row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  ')
    );

    return [headerRow, separator, ...dataRows].join('\n');
  }

  element(data: Record<string, unknown>): string {
    const lines: string[] = [];
    const maxKeyLength = Math.max(...Object.keys(data).map(k => k.length));

    for (const [key, value] of Object.entries(data)) {
      const paddedKey = key.padEnd(maxKeyLength);
      lines.push(`${paddedKey}  ${formatValue(value)}`);
    }

    return lines.join('\n');
  }

  list(items: Record<string, unknown>[]): string {
    if (items.length === 0) {
      return 'No results';
    }

    // Extract common display fields
    const displayFields = ['id', 'title', 'name', 'status', 'type'];
    const headers = displayFields.filter(f =>
      items.some(item => item[f] !== undefined)
    );

    const rows = items.map(item =>
      headers.map(h => item[h])
    );

    return this.table(headers.map(h => h.toUpperCase()), rows);
  }

  tree(node: TreeNode, prefix: string = '', isLast: boolean = true): string {
    const connector = isLast ? '└── ' : '├── ';
    const lines: string[] = [prefix + connector + node.label];

    if (node.children) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childIsLast = i === node.children.length - 1;
        lines.push(this.tree(child, childPrefix, childIsLast));
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// Verbose Formatter
// ============================================================================

/**
 * Verbose output formatter - extends human format with extra details
 */
class VerboseFormatter implements OutputFormatter {
  private humanFormatter = new HumanFormatter();

  success(result: CommandResult): string {
    // Use human formatter for success, but add more details if available
    const basic = this.humanFormatter.success(result);

    // Add data details if it's an object
    if (result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
      const details = Object.entries(result.data as Record<string, unknown>)
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      return `${basic}\n\nDetails:\n${details}`;
    }

    return basic;
  }

  error(result: CommandResult): string {
    const lines: string[] = [`Error: ${result.error}`];

    // Add exit code
    lines.push(`  Code: ${result.exitCode}`);

    // Add details if available
    if (result.data && typeof result.data === 'object') {
      lines.push(`  Details: ${JSON.stringify(result.data)}`);
    }

    // Add stack trace hint
    lines.push('');
    lines.push('For more details, check the application logs.');

    return lines.join('\n');
  }

  table(headers: string[], rows: unknown[][]): string {
    return this.humanFormatter.table(headers, rows);
  }

  element(data: Record<string, unknown>): string {
    return this.humanFormatter.element(data);
  }

  list(items: Record<string, unknown>[]): string {
    return this.humanFormatter.list(items);
  }

  tree(data: TreeNode): string {
    return this.humanFormatter.tree(data);
  }
}

// ============================================================================
// JSON Formatter
// ============================================================================

/**
 * JSON output formatter
 */
class JsonFormatter implements OutputFormatter {
  success(result: CommandResult): string {
    return JSON.stringify({
      success: true,
      data: result.data,
    }, null, 2);
  }

  error(result: CommandResult): string {
    return JSON.stringify({
      success: false,
      error: result.error,
      exitCode: result.exitCode,
    }, null, 2);
  }

  table(_headers: string[], rows: unknown[][]): string {
    return JSON.stringify(rows, null, 2);
  }

  element(data: Record<string, unknown>): string {
    return JSON.stringify(data, null, 2);
  }

  list(items: Record<string, unknown>[]): string {
    return JSON.stringify(items, null, 2);
  }

  tree(data: TreeNode): string {
    return JSON.stringify(data, null, 2);
  }
}

// ============================================================================
// Quiet Formatter
// ============================================================================

/**
 * Quiet/minimal output formatter
 */
class QuietFormatter implements OutputFormatter {
  success(result: CommandResult): string {
    // In quiet mode, only output IDs or minimal data
    if (result.data === undefined) return '';

    if (typeof result.data === 'string') {
      return result.data;
    }

    if (Array.isArray(result.data)) {
      return result.data
        .map(item => {
          if (typeof item === 'object' && item !== null && 'id' in item) {
            return (item as { id: string }).id;
          }
          return String(item);
        })
        .join('\n');
    }

    if (typeof result.data === 'object' && result.data !== null && 'id' in result.data) {
      return (result.data as { id: string }).id;
    }

    return '';
  }

  error(result: CommandResult): string {
    return result.error ?? 'Error';
  }

  table(_headers: string[], rows: unknown[][]): string {
    // Output first column (typically ID)
    return rows.map(row => String(row[0] ?? '')).join('\n');
  }

  element(data: Record<string, unknown>): string {
    // Output ID if present
    if (data.id) {
      return String(data.id);
    }
    return '';
  }

  list(items: Record<string, unknown>[]): string {
    return items
      .map(item => item.id ?? '')
      .filter(Boolean)
      .join('\n');
  }

  tree(data: TreeNode): string {
    // Flatten tree to labels only
    const flatten = (node: TreeNode): string[] => {
      const result = [node.label];
      if (node.children) {
        for (const child of node.children) {
          result.push(...flatten(child));
        }
      }
      return result;
    };
    return flatten(data).join('\n');
  }
}

// ============================================================================
// Formatter Factory
// ============================================================================

const formatters: Record<OutputMode, OutputFormatter> = {
  human: new HumanFormatter(),
  verbose: new VerboseFormatter(),
  json: new JsonFormatter(),
  quiet: new QuietFormatter(),
};

/**
 * Gets the appropriate formatter for the output mode
 */
export function getFormatter(mode: OutputMode): OutputFormatter {
  return formatters[mode];
}

/**
 * Determines output mode from global options
 */
export function getOutputMode(options: { json?: boolean; quiet?: boolean; verbose?: boolean }): OutputMode {
  if (options.json) return 'json';
  if (options.quiet) return 'quiet';
  if (options.verbose) return 'verbose';
  return 'human';
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Formats a value for human display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

// ============================================================================
// Status Styling
// ============================================================================

/**
 * Status display characters (can be extended with colors)
 */
export const STATUS_ICONS: Record<string, string> = {
  open: '○',
  in_progress: '◐',
  blocked: '●',
  deferred: '◌',
  closed: '✓',
  tombstone: '×',
  draft: '○',
  active: '◐',
  completed: '✓',
  abandoned: '×',
  pending: '○',
  running: '◐',
  paused: '◌',
  failed: '×',
};

/**
 * Gets the status icon for a status value
 */
export function getStatusIcon(status: string): string {
  return STATUS_ICONS[status] ?? '?';
}
