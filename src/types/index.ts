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
export * from './playbook.js';
export * from './workflow.js';

// Library exports - exclude duplicates
// Note: hasDescription is also in channel.js but with a different implementation for channels
export {
  // Library type and interfaces
  Library,
  HydratedLibrary,
  LibraryId,
  // Constants
  MIN_LIBRARY_NAME_LENGTH,
  MAX_LIBRARY_NAME_LENGTH,
  // Validation
  isValidLibraryName,
  validateLibraryName,
  isValidLibraryId,
  validateLibraryId,
  // Type guards
  isLibrary,
  validateLibrary,
  // Factory functions
  createLibrary,
  CreateLibraryInput,
  updateLibrary,
  UpdateLibraryInput,
  // Utility functions (note: some may conflict with channel.js)
  hasDescription as libraryHasDescription,
  getLibraryDisplayName,
  filterByCreator as filterLibrariesByCreator,
  filterWithDescription as filterLibrariesWithDescription,
  filterWithoutDescription as filterLibrariesWithoutDescription,
  sortByName as sortLibrariesByName,
  sortByCreationDate as sortLibrariesByCreationDate,
  sortByUpdateDate as sortLibrariesByUpdateDate,
  groupByCreator as groupLibrariesByCreator,
  searchByName as searchLibrariesByName,
  findByName as findLibraryByName,
  findById as findLibraryById,
  isNameUnique as isLibraryNameUnique,
} from './library.js';

// Team exports - exclude duplicates
export {
  // Team type and interfaces
  Team,
  HydratedTeam,
  TeamId,
  // Constants
  MIN_TEAM_NAME_LENGTH,
  MAX_TEAM_NAME_LENGTH,
  MAX_TEAM_MEMBERS,
  // Validation
  isValidTeamName,
  validateTeamName,
  isValidTeamId,
  validateTeamId,
  isValidMembers as isValidTeamMembers,
  validateMembers as validateTeamMembers,
  // Type guards
  isTeam,
  validateTeam,
  // Factory functions
  createTeam,
  CreateTeamInput,
  updateTeam,
  UpdateTeamInput,
  // Membership operations
  MembershipError,
  addMember as addTeamMember,
  removeMember as removeTeamMember,
  isMember as isTeamMember,
  getMemberCount as getTeamMemberCount,
  // Utility functions (note: some may conflict with other modules)
  hasDescription as teamHasDescription,
  getTeamDisplayName,
  filterByCreator as filterTeamsByCreator,
  filterWithDescription as filterTeamsWithDescription,
  filterWithoutDescription as filterTeamsWithoutDescription,
  filterByMember as filterTeamsByMember,
  filterWithMembers as filterTeamsWithMembers,
  filterEmpty as filterEmptyTeams,
  sortByName as sortTeamsByName,
  sortByMemberCount as sortTeamsByMemberCount,
  sortByCreationDate as sortTeamsByCreationDate,
  sortByUpdateDate as sortTeamsByUpdateDate,
  groupByCreator as groupTeamsByCreator,
  searchByName as searchTeamsByName,
  findByName as findTeamByName,
  findById as findTeamById,
  isNameUnique as isTeamNameUnique,
  getTeamsForEntity,
  getAllMembers as getAllTeamMembers,
  haveCommonMembers as teamsHaveCommonMembers,
  getCommonMembers as getTeamsCommonMembers,
} from './team.js';

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
