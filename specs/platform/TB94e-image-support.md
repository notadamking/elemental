# TB94e: Image Block Support Specification

## Purpose

Add image support to the document editor with both file upload and URL insertion, storing images using standard Markdown syntax (`![alt](url)`) for AI agent compatibility.

## Markdown Format

Images use standard Markdown syntax:

```markdown
![Alt text description](/api/uploads/abc123.png)
![Logo](/api/uploads/logo.png "Optional caption")
```

This syntax ensures:
- **AI Agent Compatibility**: Standard Markdown that any tool can read/write
- **Universal Interoperability**: Works with GitHub, external tools, and preview renderers
- **Simplicity**: No custom syntax to learn

## Image Insertion Methods

### 1. Slash Command

Command: `/image`

Opens the ImageUploadModal with two tabs:
- **Upload**: Drag-and-drop or file picker for local images
- **URL**: Direct URL input for external images

### 2. Toolbar Button

An image icon in the blocks overflow menu triggers the same ImageUploadModal.

### 3. Direct URL

The URL tab allows pasting external image URLs directly.

## Server Endpoints

### Upload Endpoint

`POST /api/uploads`

- Accepts: `multipart/form-data` with image file
- Storage: `.elemental/uploads/{hash}.{ext}`
- Returns: `{ url: "/api/uploads/{hash}.{ext}" }`
- Supported: jpg, jpeg, png, gif, webp, svg
- Max size: 10MB

### Serve Endpoint

`GET /api/uploads/:filename`

Serves uploaded files with appropriate content-type headers.

### List Endpoint

`GET /api/uploads`

Returns list of all uploaded files with metadata.

### Delete Endpoint

`DELETE /api/uploads/:filename`

Removes an uploaded file.

## ImageUploadModal Component

File: `apps/web/src/components/editor/ImageUploadModal.tsx`

### Upload Tab
- Drag-and-drop zone
- File picker button
- Progress indicator during upload
- Preview after upload

### URL Tab
- URL input field
- Preview loading
- Validation (must be valid image URL)

### Common
- Alt text input (required for accessibility)
- Insert button
- Cancel button

## Test Coverage

14 Playwright tests in `apps/web/tests/tb94e-image-support.spec.ts`

## Implementation Checklist

- [x] Add Image extension to Tiptap
- [x] Create ImageUploadModal component
- [x] Add /image slash command
- [x] Add image button to toolbar overflow
- [x] Implement POST /api/uploads endpoint
- [x] Implement GET /api/uploads/:filename endpoint
- [x] Implement GET /api/uploads endpoint (list)
- [x] Implement DELETE /api/uploads/:filename endpoint
- [x] Add drag-and-drop support
- [x] Add URL input support
- [x] Add alt text input
- [x] Ensure Markdown output uses standard syntax
- [x] Write Playwright tests
- [x] Update PLAN.md with completion status

## Status

**Implemented** - All functionality complete and tested.
