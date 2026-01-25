import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { X, Loader2, Plus, FileText } from 'lucide-react';

interface Entity {
  id: string;
  name: string;
  entityType: string;
}

interface Library {
  id: string;
  name: string;
}

interface CreateDocumentInput {
  title: string;
  contentType: string;
  content: string;
  createdBy: string;
  tags?: string[];
  libraryId?: string;
}

interface CreateDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (document: { id: string }) => void;
  defaultLibraryId?: string;
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

function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Failed to create document');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all document-related queries
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['libraries'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

const CONTENT_TYPE_OPTIONS = [
  { value: 'text', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
];

export function CreateDocumentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultLibraryId,
}: CreateDocumentModalProps) {
  const [title, setTitle] = useState('');
  const [contentType, setContentType] = useState('markdown');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [libraryId, setLibraryId] = useState(defaultLibraryId || '');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const createDocument = useCreateDocument();
  const { data: entities } = useEntities();
  const { data: libraries } = useLibraries();

  // Focus title input when modal opens
  useEffect(() => {
    if (isOpen && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setContentType('markdown');
      setContent('');
      setTagsInput('');
      setCreatedBy('');
      setLibraryId(defaultLibraryId || '');
      createDocument.reset();
    }
  }, [isOpen, defaultLibraryId]);

  // Set default createdBy to operator (human entity), fall back to first entity
  useEffect(() => {
    if (entities && entities.length > 0 && !createdBy) {
      const operator = entities.find((e) => e.entityType === 'human');
      setCreatedBy(operator?.id || entities[0].id);
    }
  }, [entities, createdBy]);

  // Set default libraryId when libraries load
  useEffect(() => {
    if (defaultLibraryId) {
      setLibraryId(defaultLibraryId);
    }
  }, [defaultLibraryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;
    if (!createdBy) return;

    const input: CreateDocumentInput = {
      title: title.trim(),
      contentType,
      content,
      createdBy,
    };

    if (tagsInput.trim()) {
      input.tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    }

    if (libraryId) {
      input.libraryId = libraryId;
    }

    try {
      const result = await createDocument.mutateAsync(input);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8" data-testid="create-document-modal" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        data-testid="create-document-modal-backdrop"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4">
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900">Create Document</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              aria-label="Close"
              data-testid="create-document-modal-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4">
            {/* Title */}
            <div className="mb-4">
              <label htmlFor="document-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                ref={titleInputRef}
                id="document-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter document title..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-document-title-input"
                required
              />
            </div>

            {/* Content Type & Created By row */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="document-content-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Content Type
                </label>
                <select
                  id="document-content-type"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-document-content-type-select"
                >
                  {CONTENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="document-created-by" className="block text-sm font-medium text-gray-700 mb-1">
                  Created By <span className="text-red-500">*</span>
                </label>
                <select
                  id="document-created-by"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  data-testid="create-document-created-by-select"
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
            </div>

            {/* Library */}
            <div className="mb-4">
              <label htmlFor="document-library" className="block text-sm font-medium text-gray-700 mb-1">
                Library (optional)
              </label>
              <select
                id="document-library"
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-document-library-select"
              >
                <option value="">No library</option>
                {libraries?.map((library) => (
                  <option key={library.id} value={library.id}>
                    {library.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Content */}
            <div className="mb-4">
              <label htmlFor="document-content" className="block text-sm font-medium text-gray-700 mb-1">
                Initial Content
              </label>
              <textarea
                id="document-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  contentType === 'json'
                    ? '{\n  "key": "value"\n}'
                    : contentType === 'markdown'
                    ? '# Heading\n\nStart writing...'
                    : 'Start writing...'
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                data-testid="create-document-content-textarea"
                rows={6}
              />
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label htmlFor="document-tags" className="block text-sm font-medium text-gray-700 mb-1">
                Tags
              </label>
              <input
                id="document-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Comma-separated tags (e.g., spec, draft, api)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                data-testid="create-document-tags-input"
              />
            </div>

            {/* Error display */}
            {createDocument.isError && (
              <div
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
                data-testid="create-document-error"
              >
                {(createDocument.error as Error)?.message || 'Failed to create document'}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                data-testid="create-document-cancel-button"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createDocument.isPending || !title.trim() || !createdBy}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="create-document-submit-button"
              >
                {createDocument.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Document
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
