/**
 * CurrentUserContext - Global context for the currently selected human entity
 *
 * Stores which human entity is currently "using" the platform.
 * This affects what inbox is shown and who messages are sent from.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

// Types
interface Entity {
  id: string;
  type: 'entity';
  name: string;
  entityType: 'agent' | 'human' | 'system';
  publicKey?: string;
  active?: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface CurrentUserContextValue {
  /** The currently selected human entity */
  currentUser: Entity | null;
  /** Set the current user by entity ID */
  setCurrentUserId: (id: string | null) => void;
  /** All available human entities */
  humanEntities: Entity[];
  /** Loading state */
  isLoading: boolean;
}

const LOCAL_STORAGE_KEY = 'elemental-current-user-id';

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(undefined);

// Hook to fetch human entities
function useHumanEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities', 'humans'],
    queryFn: async () => {
      const response = await fetch('/api/entities?entityType=human&limit=100');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      return data.items || [];
    },
  });
}

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { data: humanEntities = [], isLoading } = useHumanEntities();
  const [currentUserId, setCurrentUserIdState] = useState<string | null>(() => {
    // Try to restore from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem(LOCAL_STORAGE_KEY);
    }
    return null;
  });

  // Persist to localStorage
  const setCurrentUserId = (id: string | null) => {
    setCurrentUserIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem(LOCAL_STORAGE_KEY, id);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  };

  // Auto-select first human entity if none selected and entities are loaded
  useEffect(() => {
    if (!isLoading && humanEntities.length > 0 && !currentUserId) {
      setCurrentUserId(humanEntities[0].id);
    }
    // If the stored user ID is not in the list of human entities, clear it
    if (!isLoading && humanEntities.length > 0 && currentUserId) {
      const exists = humanEntities.some(e => e.id === currentUserId);
      if (!exists) {
        setCurrentUserId(humanEntities[0].id);
      }
    }
  }, [humanEntities, isLoading, currentUserId]);

  const currentUser = humanEntities.find(e => e.id === currentUserId) ?? null;

  return (
    <CurrentUserContext.Provider
      value={{
        currentUser,
        setCurrentUserId,
        humanEntities,
        isLoading,
      }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (context === undefined) {
    throw new Error('useCurrentUser must be used within a CurrentUserProvider');
  }
  return context;
}
