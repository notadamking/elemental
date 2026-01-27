/**
 * UserSelector - Dropdown to select the current human user
 *
 * Allows switching between human entities to view their inbox
 * and send messages as different users.
 */

import { User } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../ui/Select';
import { useCurrentUser } from '../../contexts';

export function UserSelector() {
  const { currentUser, setCurrentUserId, humanEntities, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-[var(--color-text-tertiary)]">
        <User className="w-4 h-4" />
        <span>Loading...</span>
      </div>
    );
  }

  if (humanEntities.length === 0) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-[var(--color-text-tertiary)]">
        <User className="w-4 h-4" />
        <span>No users</span>
      </div>
    );
  }

  return (
    <Select
      value={currentUser?.id ?? ''}
      onValueChange={(value) => setCurrentUserId(value)}
    >
      <SelectTrigger
        size="sm"
        className="min-w-[140px] max-w-[180px]"
        data-testid="user-selector-trigger"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
            <User className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          </div>
          <SelectValue placeholder="Select user">
            {currentUser?.name ?? 'Select user'}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {humanEntities.map((entity) => (
          <SelectItem
            key={entity.id}
            value={entity.id}
            data-testid={`user-selector-option-${entity.id}`}
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="truncate">{entity.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
