export { keyboardManager, type Shortcut, type ShortcutHandler } from './keyboard';
export {
  findElementPosition,
  calculateScrollOffset,
  applyHighlight,
  highlightByTestId,
  HIGHLIGHT_DURATION,
  HIGHLIGHT_CLASS,
  type DeepLinkConfig,
  type DeepLinkResult,
} from './deep-link';
export {
  type TimePeriod,
  TIME_PERIOD_LABELS,
  getTimePeriod,
  groupByTimePeriod,
  formatRelativeTime,
  formatCompactTime,
  getUpdateInterval,
  getSmartUpdateInterval,
  type GroupedItem,
} from './time';
