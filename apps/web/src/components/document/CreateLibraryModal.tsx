import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Loader2, Plus, FolderPlus } from 'lucide-react';
import { TagInput } from '../ui/TagInput';
import { ResponsiveModal } from '../shared/ResponsiveModal';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface Library {
  id: string;
  name: string;
}

interface CreateLibraryInput {
  name: string;
  createdBy: string;
  parentId?: string;
  tags?: string[];
}

interface CreateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (library: { id: string }) => void;
  defaultParentId?: string;
}

function useEntities() {
  return useQuery<Entity[]>({
    queryKey: ['entities'],
    queryFn: async () => {
      const response = await fetch('/api/entities');
      if (!response.ok) throw new Error('Failed to fetch entities');
      const data = await response.json();
      // Handle paginated response format
      return data.items || data;
    },
  });
}

function useLibraries() {
  return useQuery<Library[]>({
    queryKey: ['libraries'],
    queryFn: async () => {
      const response = await fetch('/api/libraries');
      if (!response.ok) throw new Error('Failed to fetch libraries');
      return response.json();
    },
  });
}

function useCreateLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateLibraryInput) => {
      const response = await fetch('/api/libraries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create library');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all library-related queries
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function CreateLibraryModal({
  isOpen,
  onClose,
  onSuccess,
  defaultParentId,
}: CreateLibraryModalProps) {
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [createdBy, setCreatedBy] = useState('');
  const [parentId, setParentId] = useState(defaultParentId || '');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const createLibrary = useCreateLibrary();
  const { data: entities } = useEntities();
  const { data: libraries } = useLibraries();

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setName('');
      setTags([]);
      setCreatedBy('');
      setParentId(defaultParentId || '');
      createLibrary.reset();
    }
  }, [isOpen, defaultParentId]);

  // Set default createdBy to operator (human entity), fall back to first entity
  useEffect(() => {
    if (entities && entities.length > 0 && !createdBy) {
      const operator = entities.find((e) => e.entityType === 'human');
      setCreatedBy(operator?.id || entities[0].id);
    }
  }, [entities, createdBy]);

  // Set default parentId when passed
  useEffect(() => {
    if (defaultParentId) {
      setParentId(defaultParentId);
    }
  }, [defaultParentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;
    if (!createdBy) return;

    const input: CreateLibraryInput = {
      name: name.trim(),
      createdBy,
    };

    if (tags.length > 0) {
      input.tags = tags;
    }

    if (parentId) {
      input.parentId = parentId;
    }

    try {
      const result = await createLibrary.mutateAsync(input);
      onSuccess?.(result);
      onClose();
    } catch {
      // Error is handled by mutation state
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const formActions = (
    <div className="flex items-center justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors touch-target"
        data-testid="create-library-cancel-button"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSubmit as unknown as () => void}
        disabled={createLibrary.isPending || !name.trim() || !createdBy}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
        data-testid="create-library-submit-button"
      >
        {createLibrary.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Create
          </>
        )}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      open={isOpen}
      onClose={onClose}
      title="Create Library"
      icon={<FolderPlus className="w-5 h-5 text-purple-500" />}
      size="md"
      data-testid="create-library-modal"
      footer={formActions}
    >
      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4" onKeyDown={handleKeyDown}>
        {/* Name */}
        <div className="mb-4">
          <label htmlFor="library-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            ref={nameInputRef}
            id="library-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter library name..."
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-target"
            data-testid="create-library-name-input"
            required
            maxLength={100}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">1-100 characters</p>
        </div>

        {/* Created By */}
        <div className="mb-4">
          <label htmlFor="library-created-by" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Created By <span className="text-red-500">*</span>
          </label>
          <select
            id="library-created-by"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-target"
            data-testid="create-library-created-by-select"
            required
          >
            <option value="">Select entity...</option>
            {entities?.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name} ({entity.entityType})
              </option>
            ))}
          </select>
        </div>

        {/* Parent Library */}
        <div className="mb-4">
          <label htmlFor="library-parent" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Parent Library <span className="text-gray-400 dark:text-gray-500 text-xs font-normal">(optional)</span>
          </label>
          <select
            id="library-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-target"
            data-testid="create-library-parent-select"
          >
            <option value="">No parent (root library)</option>
            {libraries?.map((library) => (
              <option key={library.id} value={library.id}>
                {library.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Nest this library under another library</p>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tags <span className="text-gray-400 dark:text-gray-500 text-xs font-normal">(optional)</span>
          </label>
          <TagInput
            tags={tags}
            onChange={setTags}
            placeholder="Type and press comma to add tags"
            data-testid="create-library-tags-input"
          />
        </div>

        {/* Error display */}
        {createLibrary.isError && (
          <div
            className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400"
            data-testid="create-library-error"
          >
            {(createLibrary.error as Error)?.message || 'Failed to create library'}
          </div>
        )}
      </form>
    </ResponsiveModal>
  );
}
