import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus, FolderPlus } from 'lucide-react';
import { TagInput } from '../ui/TagInput';

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
      return response.json();
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8" data-testid="create-library-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-library-modal-backdrop"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-semibold text-gray-900">Create Library</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="create-library-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4">
            {/* Name */}
            <div className="mb-4">
              <label htmlFor="library-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="library-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter library name..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                data-testid="create-library-name-input"
                required
                maxLength={100}
              />
              <p className="mt-1 text-xs text-gray-500">1-100 characters</p>
            </div>

            {/* Created By */}
            <div className="mb-4">
              <label htmlFor="library-created-by" className="block text-sm font-medium text-gray-700 mb-1">
                Created By <span className="text-red-500">*</span>
              </label>
              <select
                id="library-created-by"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
              <label htmlFor="library-parent" className="block text-sm font-medium text-gray-700 mb-1">
                Parent Library (optional)
              </label>
              <select
                id="library-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                data-testid="create-library-parent-select"
              >
                <option value="">No parent (root library)</option>
                {libraries?.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">Nest this library under another library</p>
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tags
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
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
                data-testid="create-library-error"
              >
                {(createLibrary.error as Error)?.message || 'Failed to create library'}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="create-library-cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createLibrary.isPending || !name.trim() || !createdBy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    Create Library
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
