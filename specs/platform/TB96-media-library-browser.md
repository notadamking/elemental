# TB96: Media Library Browser Specification

**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Add a media library browser to the image picker modal, allowing users to reuse previously uploaded images without re-uploading them. This improves efficiency and helps manage storage by showing image usage across documents.

## Features

### Library Tab in Image Modal

The ImageUploadModal now has three tabs:
1. **Upload** - Upload new images via drag-and-drop or file picker
2. **URL** - Insert images from external URLs
3. **Library** - Browse and select from previously uploaded images (new)

### Image Grid View

The Library tab displays uploaded images in a 3-column grid with:
- Thumbnail preview (28rem height per image)
- Hover overlay showing:
  - Filename
  - File size
  - Usage count (how many documents reference this image)
  - Delete button

### Selection

- Click image to select it
- Blue border and checkmark indicator on selected image
- Selected image shows larger preview and metadata below grid
- Insert button becomes enabled when an image is selected

### Search/Filter

- Real-time search by filename
- Empty state when no matches found
- Clears when modal is closed

### Delete Functionality

- Delete button appears on hover overlay
- Two-step confirmation (click once to show confirm/cancel, click confirm to delete)
- Shows loading spinner during deletion
- Removes deleted image from grid immediately
- Clears selection if deleted image was selected

### Usage Tracking

New server endpoint tracks which documents reference each image:
- `GET /api/uploads/:filename/usage`
- Scans all documents for image URL references
- Returns count and list of documents with id and title
- Helps users identify unused images safe to delete

## Server Endpoints

### GET /api/uploads/:filename/usage

Returns usage information for a specific uploaded image.

**Request:**
```
GET /api/uploads/abc123.png/usage
```

**Response:**
```json
{
  "filename": "abc123.png",
  "count": 2,
  "documents": [
    { "id": "el-xyz", "title": "My Document" },
    { "id": "el-abc", "title": "Another Doc" }
  ]
}
```

**Error Responses:**
- `400` - Invalid filename (directory traversal attempt)
- `404` - File not found
- `500` - Internal server error

## UI Components

### ImageUploadModal.tsx Updates

The modal now supports three modes:
- `upload` - Original upload functionality
- `url` - Original URL input functionality
- `library` - New media library browser

The modal width expands when in library mode to accommodate the grid view.

### State Management

New state variables:
- `libraryImages` - Array of uploaded files with metadata
- `libraryLoading` - Loading state for fetching images
- `librarySearch` - Current search term
- `selectedLibraryImage` - Currently selected image
- `deleteConfirm` - Filename pending delete confirmation
- `deleting` - Delete operation in progress

## Data Flow

1. User clicks Library tab
2. `fetchLibraryImages()` is called
3. Fetches `/api/uploads` for file list
4. For each file, fetches `/api/uploads/:filename/usage` for usage data
5. Results displayed in grid
6. User searches/filters client-side
7. User selects image
8. Insert button saves `${API_BASE}${selectedImage.url}` to editor

## Testing

13 Playwright tests cover:

### API Tests
- List uploaded images
- Upload new image
- Serve uploaded image
- Delete uploaded image
- 404 for non-existent files
- Directory traversal prevention

### Usage Tracking Tests
- Get usage info for image
- 404 for non-existent image usage
- Track usage when image is in document content

### UI Structure Tests
- Library tab exists in modal
- Library mode state exists

### Metadata Tests
- Complete file metadata in list response
- Files sorted by creation time (newest first)

## Dependencies

- TB94e (Image Block Support) - Core upload functionality
- Radix UI Dialog - Modal component
- TanStack Query - Data fetching (for editor hooks)
- lucide-react - Icons (Grid, Search, Trash2, Check, AlertCircle, Loader2)

## Dark Mode Support

All UI elements have dark mode variants:
- Modal background: `dark:bg-gray-900`
- Tab buttons: `dark:bg-blue-900/50` (active), `dark:bg-gray-800` (inactive)
- Image grid: `dark:bg-gray-800` for backgrounds
- Text: `dark:text-gray-100` for primary, `dark:text-gray-400` for secondary
- Borders: `dark:border-gray-600`, `dark:border-gray-700`

## File Locations

- **Modal Component:** `apps/web/src/components/editor/ImageUploadModal.tsx`
- **Server Endpoint:** `apps/server/src/index.ts` (GET /api/uploads/:filename/usage)
- **Tests:** `apps/web/tests/tb96-media-library-browser.spec.ts`

## Implementation Notes

1. Route order matters - `/api/uploads/:filename/usage` must be defined before `/api/uploads/:filename` in Hono router
2. Usage tracking scans document content strings for image filename matches
3. Grid uses CSS grid with `grid-cols-3` for 3-column layout
4. Delete confirmation uses inline buttons instead of a separate modal
