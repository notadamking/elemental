/**
 * ImageUploadModal - Modal for uploading images to the document editor
 *
 * Features:
 * - File picker for selecting images
 * - Drag-and-drop support
 * - Image preview before insert
 * - Alt text input
 * - URL input for external images
 * - Upload progress indication
 */

import { useCallback, useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Upload, X, Link, ImageIcon, Loader2 } from 'lucide-react';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string, alt?: string) => void;
}

const API_BASE = 'http://localhost:3456';

export function ImageUploadModal({ isOpen, onClose, onInsert }: ImageUploadModalProps) {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; file?: File } | null>(null);
  const [altText, setAltText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setMode('upload');
    setDragOver(false);
    setUploading(false);
    setError(null);
    setPreview(null);
    setAltText('');
    setUrlInput('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const uploadFile = async (file: File): Promise<string | null> => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setError(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP, SVG`);
      return null;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError(`File too large: ${(file.size / (1024 * 1024)).toFixed(2)}MB. Maximum: 10MB`);
      return null;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/uploads`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      // Return full URL for the image
      return `${API_BASE}${result.url}`;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    // Create preview
    const previewUrl = URL.createObjectURL(file);
    setPreview({ url: previewUrl, file });
    setError(null);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleFileSelect(file);
      } else {
        setError('Please drop an image file');
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInsert = useCallback(async () => {
    if (mode === 'url') {
      if (!urlInput.trim()) {
        setError('Please enter an image URL');
        return;
      }
      onInsert(urlInput.trim(), altText || undefined);
      handleClose();
    } else if (preview?.file) {
      const uploadedUrl = await uploadFile(preview.file);
      if (uploadedUrl) {
        onInsert(uploadedUrl, altText || undefined);
        handleClose();
      }
    }
  }, [mode, urlInput, preview, altText, onInsert, handleClose]);

  const handleUrlPreview = useCallback(() => {
    if (urlInput.trim()) {
      setPreview({ url: urlInput.trim() });
      setError(null);
    }
  }, [urlInput]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-lg z-50"
          data-testid="image-upload-modal"
        >
          <Dialog.Title className="text-lg font-semibold text-gray-900 mb-4">
            Insert Image
          </Dialog.Title>

          {/* Mode tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => {
                setMode('upload');
                setError(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'upload'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid="image-upload-tab"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
            <button
              onClick={() => {
                setMode('url');
                setError(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === 'url'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid="image-url-tab"
            >
              <Link className="w-4 h-4" />
              URL
            </button>
          </div>

          {/* Upload mode */}
          {mode === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone / Preview */}
              {preview ? (
                <div className="relative">
                  <img
                    src={preview.url}
                    alt="Preview"
                    className="w-full h-48 object-contain bg-gray-100 rounded-lg"
                    data-testid="image-preview"
                  />
                  <button
                    onClick={() => setPreview(null)}
                    className="absolute top-2 right-2 p-1 bg-white rounded-full shadow hover:bg-gray-100"
                    title="Remove"
                  >
                    <X className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    dragOver
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                  data-testid="image-drop-zone"
                >
                  <ImageIcon className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600 mb-1">
                    Drop an image here or click to browse
                  </p>
                  <p className="text-xs text-gray-400">
                    JPEG, PNG, GIF, WebP, SVG up to 10MB
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                onChange={handleFileInputChange}
                className="hidden"
                data-testid="image-file-input"
              />
            </div>
          )}

          {/* URL mode */}
          {mode === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onBlur={handleUrlPreview}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="image-url-input"
                  />
                </div>
              </div>

              {/* URL Preview */}
              {preview && (
                <div className="relative">
                  <img
                    src={preview.url}
                    alt="Preview"
                    className="w-full h-48 object-contain bg-gray-100 rounded-lg"
                    onError={() => setError('Failed to load image from URL')}
                    data-testid="image-url-preview"
                  />
                </div>
              )}
            </div>
          )}

          {/* Alt text input */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alt Text (optional)
            </label>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              placeholder="Describe the image..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="image-alt-input"
            />
            <p className="text-xs text-gray-400 mt-1">
              Alt text helps with accessibility and SEO
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div
              className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600"
              data-testid="image-upload-error"
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={uploading || (!preview && mode === 'upload') || (!urlInput && mode === 'url')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="image-insert-button"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                'Insert Image'
              )}
            </button>
          </div>

          {/* Close button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 rounded"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ImageUploadModal;
