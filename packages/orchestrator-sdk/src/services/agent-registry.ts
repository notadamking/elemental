/**
 * Agent Registry Service
 *
 * This service provides agent registration and management functionality.
 * It allows registering agents with roles (director, worker, steward) and
 * querying agents by various criteria.
 *
 * Key features:
 * - Register agents with specific roles and capabilities
 * - Query agents by role, status, and other filters
 * - Track agent session status
 * - Manage agent metadata
 * - Create dedicated channels for agent messaging (TB-O7a)
 *
 * @module
 */

import type { Entity, EntityId, ElementId, Channel, ChannelId } from '@elemental/core';
import { EntityTypeValue, createEntity, createTimestamp, createGroupChannel } from '@elemental/core';
import type { ElementalAPI } from '@elemental/sdk';
import type {
  AgentRole,
  AgentMetadata,
  DirectorMetadata,
  WorkerMetadata,
  StewardMetadata,
  AgentFilter,
  RegisterDirectorInput,
  RegisterWorkerInput,
  RegisterStewardInput,
} from '../types/index.js';
import {
  createAgentCapabilities,
} from '../types/index.js';
// Import shared agent entity types from the API module to avoid duplication
import {
  type AgentEntity,
  isAgentEntity,
  getAgentMetadata,
} from '../api/orchestrator-api.js';

// Re-export for convenience
export type { AgentEntity };
export { isAgentEntity, getAgentMetadata };

// ============================================================================
// Constants
// ============================================================================

/**
 * Key used to store agent metadata in Entity.metadata
 */
const AGENT_META_KEY = 'agent';

/**
 * Prefix for agent channel names
 */
const AGENT_CHANNEL_PREFIX = 'agent-';

/**
 * Generates the channel name for an agent
 */
export function generateAgentChannelName(agentId: EntityId): string {
  return `${AGENT_CHANNEL_PREFIX}${agentId}`;
}

/**
 * Parses an agent ID from a channel name
 * Returns null if the name doesn't match the agent channel pattern
 */
export function parseAgentChannelName(channelName: string): EntityId | null {
  if (!channelName.startsWith(AGENT_CHANNEL_PREFIX)) {
    return null;
  }
  const agentId = channelName.slice(AGENT_CHANNEL_PREFIX.length);
  // Basic validation - agent IDs should match the element ID pattern
  if (!/^el-[0-9a-z]{3,8}$/.test(agentId)) {
    return null;
  }
  return agentId as EntityId;
}

// ============================================================================
// Registration Input Types (Extended)
// ============================================================================

/**
 * Generic agent registration input
 */
export type RegisterAgentInput =
  | (RegisterDirectorInput & { role: 'director' })
  | (RegisterWorkerInput & { role: 'worker' })
  | (RegisterStewardInput & { role: 'steward' });

// ============================================================================
// Agent Registry Interface
// ============================================================================

/**
 * Agent Registry interface for managing agents in the orchestration system.
 *
 * The registry provides methods for:
 * - Registering agents with specific roles
 * - Querying agents by various criteria
 * - Managing agent session status
 */
export interface AgentRegistry {
  // ----------------------------------------
  // Agent Registration
  // ----------------------------------------

  /**
   * Registers a new agent with the given parameters.
   * This is a convenience method that dispatches to the appropriate
   * role-specific registration method.
   */
  registerAgent(input: RegisterAgentInput): Promise<AgentEntity>;

  /**
   * Registers a Director agent.
   * There should typically be only one Director per workspace.
   */
  registerDirector(input: RegisterDirectorInput): Promise<AgentEntity>;

  /**
   * Registers a Worker agent.
   * Workers can be ephemeral (short-lived, task-specific) or persistent (long-lived).
   */
  registerWorker(input: RegisterWorkerInput): Promise<AgentEntity>;

  /**
   * Registers a Steward agent.
   * Stewards perform support tasks like merging, health checks, etc.
   */
  registerSteward(input: RegisterStewardInput): Promise<AgentEntity>;

  // ----------------------------------------
  // Agent Queries
  // ----------------------------------------

  /**
   * Gets an agent by ID
   */
  getAgent(entityId: EntityId): Promise<AgentEntity | undefined>;

  /**
   * Gets an agent by name
   */
  getAgentByName(name: string): Promise<AgentEntity | undefined>;

  /**
   * Lists agents matching the filter
   */
  listAgents(filter?: AgentFilter): Promise<AgentEntity[]>;

  /**
   * Gets all agents with a specific role
   */
  getAgentsByRole(role: AgentRole): Promise<AgentEntity[]>;

  /**
   * Gets available workers (idle or with capacity for more tasks)
   */
  getAvailableWorkers(): Promise<AgentEntity[]>;

  /**
   * Gets all stewards
   */
  getStewards(): Promise<AgentEntity[]>;

  /**
   * Gets the Director agent (there should be only one per workspace)
   */
  getDirector(): Promise<AgentEntity | undefined>;

  // ----------------------------------------
  // Agent Session Management
  // ----------------------------------------

  /**
   * Updates an agent's session status
   */
  updateAgentSession(
    entityId: EntityId,
    sessionId: string | undefined,
    status: 'idle' | 'running' | 'suspended' | 'terminated'
  ): Promise<AgentEntity>;

  /**
   * Updates an agent's metadata
   */
  updateAgentMetadata(
    entityId: EntityId,
    updates: Partial<AgentMetadata>
  ): Promise<AgentEntity>;

  /**
   * Updates an agent's properties (e.g., name)
   */
  updateAgent(
    entityId: EntityId,
    updates: { name?: string }
  ): Promise<AgentEntity>;

  // ----------------------------------------
  // Agent Channel Operations (TB-O7a)
  // ----------------------------------------

  /**
   * Gets the dedicated channel for an agent.
   * Each agent has a channel named `agent-{agentId}` for receiving messages.
   *
   * @param agentId - The entity ID of the agent
   * @returns The agent's channel, or undefined if not found
   */
  getAgentChannel(agentId: EntityId): Promise<Channel | undefined>;

  /**
   * Gets the channel ID for an agent from its metadata.
   * This is faster than getAgentChannel() when you only need the ID.
   *
   * @param agentId - The entity ID of the agent
   * @returns The channel ID, or undefined if the agent has no channel
   */
  getAgentChannelId(agentId: EntityId): Promise<ChannelId | undefined>;
}

// ============================================================================
// Agent Registry Implementation
// ============================================================================

/**
 * Implementation of the Agent Registry service.
 *
 * This implementation uses the ElementalAPI for storage operations,
 * storing agent information as Entity elements with specialized metadata.
 */
export class AgentRegistryImpl implements AgentRegistry {
  private readonly api: ElementalAPI;

  constructor(api: ElementalAPI) {
    this.api = api;
  }

  // ----------------------------------------
  // Agent Registration
  // ----------------------------------------

  async registerAgent(input: RegisterAgentInput): Promise<AgentEntity> {
    switch (input.role) {
      case 'director':
        return this.registerDirector(input);
      case 'worker':
        return this.registerWorker(input);
      case 'steward':
        return this.registerSteward(input);
      default:
        throw new Error(`Unknown agent role: ${(input as { role: string }).role}`);
    }
  }

  async registerDirector(input: RegisterDirectorInput): Promise<AgentEntity> {
    const agentMetadata: DirectorMetadata = {
      agentRole: 'director',
      sessionStatus: 'idle',
      capabilities: input.capabilities ? createAgentCapabilities(input.capabilities) : undefined,
      roleDefinitionRef: input.roleDefinitionRef,
    };

    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
    });

    // Cast entity to satisfy the create method's signature
    const saved = await this.api.create(
      entity as unknown as Record<string, unknown> & { createdBy: EntityId }
    );
    const agentEntity = saved as AgentEntity;
    // Cast to EntityId (Element.id is ElementId but AgentEntity is an Entity)
    const agentEntityId = agentEntity.id as unknown as EntityId;

    // Create dedicated channel for the agent (TB-O7a)
    const channel = await this.createAgentChannel(agentEntityId, input.createdBy);

    // Update agent metadata with channel ID
    const updatedAgent = await this.updateAgentMetadata(agentEntityId, {
      channelId: channel.id,
    } as Partial<AgentMetadata>);

    return updatedAgent;
  }

  async registerWorker(input: RegisterWorkerInput): Promise<AgentEntity> {
    const agentMetadata: WorkerMetadata = {
      agentRole: 'worker',
      workerMode: input.workerMode,
      sessionStatus: 'idle',
      capabilities: input.capabilities ? createAgentCapabilities(input.capabilities) : undefined,
      roleDefinitionRef: input.roleDefinitionRef,
    };

    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
      reportsTo: input.reportsTo,
    });

    // Cast entity to satisfy the create method's signature
    const saved = await this.api.create(
      entity as unknown as Record<string, unknown> & { createdBy: EntityId }
    );
    const agentEntity = saved as AgentEntity;
    // Cast to EntityId (Element.id is ElementId but AgentEntity is an Entity)
    const agentEntityId = agentEntity.id as unknown as EntityId;

    // Create dedicated channel for the agent (TB-O7a)
    const channel = await this.createAgentChannel(agentEntityId, input.createdBy);

    // Update agent metadata with channel ID
    const updatedAgent = await this.updateAgentMetadata(agentEntityId, {
      channelId: channel.id,
    } as Partial<AgentMetadata>);

    return updatedAgent;
  }

  async registerSteward(input: RegisterStewardInput): Promise<AgentEntity> {
    const agentMetadata: StewardMetadata = {
      agentRole: 'steward',
      stewardFocus: input.stewardFocus,
      triggers: input.triggers,
      sessionStatus: 'idle',
      capabilities: input.capabilities ? createAgentCapabilities(input.capabilities) : undefined,
      roleDefinitionRef: input.roleDefinitionRef,
    };

    const entity = await createEntity({
      name: input.name,
      entityType: EntityTypeValue.AGENT,
      createdBy: input.createdBy,
      tags: input.tags,
      metadata: { [AGENT_META_KEY]: agentMetadata },
      reportsTo: input.reportsTo,
    });

    // Cast entity to satisfy the create method's signature
    const saved = await this.api.create(
      entity as unknown as Record<string, unknown> & { createdBy: EntityId }
    );
    const agentEntity = saved as AgentEntity;
    // Cast to EntityId (Element.id is ElementId but AgentEntity is an Entity)
    const agentEntityId = agentEntity.id as unknown as EntityId;

    // Create dedicated channel for the agent (TB-O7a)
    const channel = await this.createAgentChannel(agentEntityId, input.createdBy);

    // Update agent metadata with channel ID
    const updatedAgent = await this.updateAgentMetadata(agentEntityId, {
      channelId: channel.id,
    } as Partial<AgentMetadata>);

    return updatedAgent;
  }

  // ----------------------------------------
  // Agent Queries
  // ----------------------------------------

  async getAgent(entityId: EntityId): Promise<AgentEntity | undefined> {
    // Cast EntityId to ElementId - they are both branded string types
    const entity = await this.api.get(entityId as unknown as ElementId);
    if (!entity || entity.type !== 'entity' || !isAgentEntity(entity as Entity)) {
      return undefined;
    }
    return entity as AgentEntity;
  }

  async getAgentByName(name: string): Promise<AgentEntity | undefined> {
    const entity = await this.api.lookupEntityByName(name);
    if (!entity || !isAgentEntity(entity as Entity)) {
      return undefined;
    }
    return entity as AgentEntity;
  }

  async listAgents(filter?: AgentFilter): Promise<AgentEntity[]> {
    // Get all entities
    const entities = await this.api.list({ type: 'entity' });

    // Filter to only agent-type entities with valid agent metadata
    let agents = (entities as Entity[]).filter((e): e is AgentEntity =>
      e.entityType === EntityTypeValue.AGENT && isAgentEntity(e)
    );

    // Apply additional filters
    if (filter) {
      agents = this.applyFilters(agents, filter);
    }

    return agents;
  }

  async getAgentsByRole(role: AgentRole): Promise<AgentEntity[]> {
    return this.listAgents({ role });
  }

  async getAvailableWorkers(): Promise<AgentEntity[]> {
    const workers = await this.listAgents({ role: 'worker' });
    return workers.filter((w) => {
      const meta = getAgentMetadata(w);
      const status = meta?.sessionStatus;
      // Consider idle or undefined (never started) as available
      return status === 'idle' || status === undefined;
    });
  }

  async getStewards(): Promise<AgentEntity[]> {
    return this.listAgents({ role: 'steward' });
  }

  async getDirector(): Promise<AgentEntity | undefined> {
    const directors = await this.listAgents({ role: 'director' });
    return directors[0];
  }

  // ----------------------------------------
  // Agent Session Management
  // ----------------------------------------

  async updateAgentSession(
    entityId: EntityId,
    sessionId: string | undefined,
    status: 'idle' | 'running' | 'suspended' | 'terminated'
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    const currentMeta = getAgentMetadata(agent);
    if (!currentMeta) {
      throw new Error(`Entity is not an agent: ${entityId}`);
    }

    const updatedAgentMeta: AgentMetadata = {
      ...currentMeta,
      sessionId,
      sessionStatus: status,
      lastActivityAt: createTimestamp(),
    } as AgentMetadata;

    // Cast EntityId to ElementId for update
    const updated = await this.api.update(entityId as unknown as ElementId, {
      metadata: { ...agent.metadata, [AGENT_META_KEY]: updatedAgentMeta },
    });

    return updated as AgentEntity;
  }

  async updateAgentMetadata(
    entityId: EntityId,
    updates: Partial<AgentMetadata>
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    const currentMeta = getAgentMetadata(agent);
    if (!currentMeta) {
      throw new Error(`Entity is not an agent: ${entityId}`);
    }

    const updatedAgentMeta: AgentMetadata = {
      ...currentMeta,
      ...updates,
    } as AgentMetadata;

    // Cast EntityId to ElementId for update
    const updated = await this.api.update(entityId as unknown as ElementId, {
      metadata: { ...agent.metadata, [AGENT_META_KEY]: updatedAgentMeta },
    });

    return updated as AgentEntity;
  }

  async updateAgent(
    entityId: EntityId,
    updates: { name?: string }
  ): Promise<AgentEntity> {
    const agent = await this.getAgent(entityId);
    if (!agent) {
      throw new Error(`Agent not found: ${entityId}`);
    }

    // Build update object with only provided fields
    const updateData: { name?: string } = {};
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    // Cast EntityId to ElementId for update
    const updated = await this.api.update(entityId as unknown as ElementId, updateData);

    return updated as AgentEntity;
  }

  // ----------------------------------------
  // Agent Channel Operations (TB-O7a)
  // ----------------------------------------

  async getAgentChannel(agentId: EntityId): Promise<Channel | undefined> {
    // First try to get the channel ID from the agent's metadata (fast path)
    const channelId = await this.getAgentChannelId(agentId);
    if (channelId) {
      const channel = await this.api.get(channelId as unknown as ElementId);
      if (channel && channel.type === 'channel') {
        return channel as Channel;
      }
    }

    // Fallback: search for the channel by name
    const channelName = generateAgentChannelName(agentId);
    const channels = await this.api.searchChannels(channelName, {
      channelType: 'group',
    });

    // Find exact match (searchChannels does pattern matching)
    const agentChannel = channels.find((c) => c.name === channelName);
    return agentChannel;
  }

  async getAgentChannelId(agentId: EntityId): Promise<ChannelId | undefined> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      return undefined;
    }

    const meta = getAgentMetadata(agent);
    return meta?.channelId;
  }

  // ----------------------------------------
  // Private Helpers
  // ----------------------------------------

  /**
   * Creates a dedicated channel for an agent and updates the agent's metadata
   * with the channel ID.
   *
   * @param agentId - The ID of the agent entity
   * @param createdBy - The entity that created the agent (will be a channel member)
   * @returns The created channel
   */
  private async createAgentChannel(agentId: EntityId, createdBy: EntityId): Promise<Channel> {
    const channelName = generateAgentChannelName(agentId);

    // Create a group channel with the agent and creator as members
    const channel = await createGroupChannel({
      name: channelName,
      createdBy: createdBy,
      members: [agentId], // Creator is automatically added
      visibility: 'private',
      joinPolicy: 'invite-only',
      tags: ['agent-channel'],
      metadata: {
        agentId,
        purpose: 'Agent direct messaging channel',
      },
    });

    // Save the channel
    const savedChannel = await this.api.create<Channel>(
      channel as unknown as Record<string, unknown> & { createdBy: EntityId }
    );

    return savedChannel;
  }

  private applyFilters(agents: AgentEntity[], filter: AgentFilter): AgentEntity[] {
    let result = agents;

    if (filter.role !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return meta?.agentRole === filter.role;
      });
    }

    if (filter.workerMode !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return (
          meta?.agentRole === 'worker' &&
          (meta as WorkerMetadata).workerMode === filter.workerMode
        );
      });
    }

    if (filter.stewardFocus !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return (
          meta?.agentRole === 'steward' &&
          (meta as StewardMetadata).stewardFocus === filter.stewardFocus
        );
      });
    }

    if (filter.sessionStatus !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return meta?.sessionStatus === filter.sessionStatus;
      });
    }

    if (filter.reportsTo !== undefined) {
      result = result.filter((a) => a.reportsTo === filter.reportsTo);
    }

    if (filter.hasSession !== undefined) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        return (meta?.sessionId !== undefined) === filter.hasSession;
      });
    }

    if (filter.requiredSkills !== undefined && filter.requiredSkills.length > 0) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        const skills = meta?.capabilities?.skills ?? [];
        const normalizedSkills = skills.map((s) => s.toLowerCase().trim());
        return filter.requiredSkills!.every((skill) =>
          normalizedSkills.includes(skill.toLowerCase().trim())
        );
      });
    }

    if (filter.requiredLanguages !== undefined && filter.requiredLanguages.length > 0) {
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        const languages = meta?.capabilities?.languages ?? [];
        const normalizedLanguages = languages.map((l) => l.toLowerCase().trim());
        return filter.requiredLanguages!.every((lang) =>
          normalizedLanguages.includes(lang.toLowerCase().trim())
        );
      });
    }

    if (filter.hasCapacity === true) {
      // Note: This filter requires knowing the current task count per agent.
      // For now, we treat agents with maxConcurrentTasks > 0 as having capacity.
      // The actual task count check should be done at a higher level with task data.
      result = result.filter((a) => {
        const meta = getAgentMetadata(a);
        const maxTasks = meta?.capabilities?.maxConcurrentTasks ?? 1;
        return maxTasks > 0;
      });
    }

    return result;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates an AgentRegistry instance
 */
export function createAgentRegistry(api: ElementalAPI): AgentRegistry {
  return new AgentRegistryImpl(api);
}
