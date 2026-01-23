/**
 * Elemental Type Definitions
 */

export * from './element.js';
export * from './entity.js';
export * from './document.js';
export * from './task.js';
export * from './event.js';
export * from './dependency.js';
export * from './plan.js';
export * from './message.js';
export * from './workflow.js';

// Channel exports - exclude duplicates that are already exported from message.js
// ChannelId, isValidChannelId, validateChannelId are in both message.js and channel.js
// sortByCreatedAtDesc is in both message.js and channel.js (different implementations)
export {
  // Channel type and enums
  Channel,
  HydratedChannel,
  ChannelType,
  ChannelTypeValue,
  Visibility,
  VisibilityValue,
  JoinPolicy,
  JoinPolicyValue,
  ChannelPermissions,
  // Constants
  MAX_CHANNEL_NAME_LENGTH,
  MIN_CHANNEL_NAME_LENGTH,
  MAX_CHANNEL_MEMBERS,
  MIN_GROUP_MEMBERS,
  DIRECT_CHANNEL_MEMBERS,
  // Validation - excluding duplicates with message.js
  isValidChannelType,
  validateChannelType,
  isValidVisibility,
  validateVisibility,
  isValidJoinPolicy,
  validateJoinPolicy,
  isValidChannelName,
  validateChannelName,
  isValidMemberId,
  validateMemberId,
  isValidDescriptionRef,
  validateDescriptionRef,
  isValidMembers,
  validateMembers,
  isValidModifyMembers,
  validateModifyMembers,
  isValidChannelPermissions,
  validateChannelPermissions,
  // Type guards
  isChannel,
  isDirectChannel,
  isGroupChannel,
  validateChannel,
  // Direct channel naming
  generateDirectChannelName,
  parseDirectChannelName,
  // Factory functions
  createGroupChannel,
  CreateGroupChannelInput,
  createDirectChannel,
  CreateDirectChannelInput,
  // Error classes
  DirectChannelMembershipError,
  NotAMemberError,
  CannotModifyMembersError,
  // Utility functions
  isMember,
  canModifyMembers,
  canJoin,
  isPublicChannel,
  isPrivateChannel,
  getMemberCount,
  hasDescription,
  filterByChannelType,
  filterDirectChannels,
  filterGroupChannels,
  filterByMember,
  filterByVisibility,
  filterPublicChannels,
  filterPrivateChannels,
  sortByName,
  sortByMemberCount,
  // Note: sortByCreatedAtDesc is intentionally not exported from channel.js
  // because message.js already exports it. Use message's sortByCreatedAtDesc for channels too.
  groupByVisibility,
  groupByChannelType,
  findDirectChannel,
  getDirectChannelsForEntity,
  validateDirectChannelConstraints,
  // Channel's ChannelId and validation functions (aliased to avoid conflict)
  ChannelId as ChannelChannelId,
  isValidChannelId as isValidChannelChannelId,
  validateChannelId as validateChannelChannelId,
} from './channel.js';
