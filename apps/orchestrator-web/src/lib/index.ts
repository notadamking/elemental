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
  // TB99: Message Day Separation
  getDateKey,
  formatDateSeparator,
  groupMessagesByDay,
  type MessageWithDayGroup,
} from './time';
