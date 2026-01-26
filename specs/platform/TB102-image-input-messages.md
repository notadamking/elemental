# TB102: Image Input in Messages Specification

**Version:** 1.0.0
**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Add the ability to attach images to messages in channel conversations. Images can be uploaded, selected from the media library, pasted from clipboard, or dropped via drag-and-drop.

## Features

### Image Attachment Button
- New image attachment button in MessageComposer (alongside document attachment)
- Icon: ImageIcon from lucide-react
- Opens image attachment modal on click

### Image Attachment Modal
- Two tabs: "Upload" and "Library"
- **Upload tab:**
  - Drop zone for drag-and-drop
  - Click to open file picker
  - Accept: JPEG, PNG, GIF, WebP
  - Max size: 10MB
  - Image preview before attachment
  - Remove button on preview
- **Library tab:**
  - Grid of previously uploaded images
  - Search/filter by filename
  - Click to select, click again to deselect
  - Selection indicator (checkmark)
  - Selected image info panel

### Composer Integration
- Image preview thumbnails in composer area
- Remove button (X) on each thumbnail
- Multiple images can be attached
- Send button enabled when images attached (even without text)

### Paste Support (TB102)
- Paste image from clipboard directly into composer
- Automatic upload to server
- Preview appears in composer
- Toast notification "Image attached"

### Drag and Drop
- Drag image file over composer shows drop indicator
- Drop uploads image and attaches to message
- Visual feedback during drag over (blue highlight)

### Message Display
- Images in messages rendered as `<img>` elements
- Max width/height constraints for display
- Click image to open in new tab
- Images stored as Markdown: `![alt](url)`

## Technical Implementation

### Components

| Component | Path | Description |
|-----------|------|-------------|
| MessageImageAttachment | `apps/web/src/components/message/MessageImageAttachment.tsx` | Modal for selecting/uploading images |
| MessageRichComposer | `apps/web/src/components/message/MessageRichComposer.tsx` | Extended with `onImagePaste` callback |
| MessageComposer | `apps/web/src/routes/messages.tsx` | Extended with image attachment state |

### Props Added

**MessageRichComposerProps:**
```typescript
interface MessageRichComposerProps {
  // ... existing props
  /** Called when an image is pasted from clipboard (TB102) */
  onImagePaste?: (file: File) => void;
}
```

### State Management

MessageComposer now manages:
- `imageAttachments: ImageAttachment[]` - Array of attached images
- `showImagePicker: boolean` - Modal visibility
- `uploadingImage: boolean` - Upload progress state
- `dragOver: boolean` - Drag state for visual feedback

### Storage Format

Images are embedded in message content as Markdown:
```markdown
Here's my message text

![image-filename](http://localhost:3456/api/uploads/filename.png)
```

This preserves AI agent compatibility (standard Markdown) while rendering images inline.

### API Endpoints Used

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/uploads` | Upload image file |
| GET | `/api/uploads` | List all uploaded images for library |
| GET | `/api/uploads/:filename` | Serve image file |

## Implementation Checklist

- [x] Web: Add image attachment button to MessageComposer
- [x] Web: Click → file picker for image
- [x] Web: Drag-and-drop image into composer
- [x] Web: Paste image from clipboard
- [x] Web: Preview attached image before sending
- [x] Web: Remove attachment button (X on preview)
- [x] Server: Images uploaded to server, URL stored in message content
- [x] Web: Render images in message content
- [x] **Verify:** 15 Playwright tests passing (`apps/web/tests/tb102-image-input-messages.spec.ts`)

## Test Coverage

| Test | Description |
|------|-------------|
| image attachment button visible | Button appears in composer |
| clicking image button opens modal | Modal opens on click |
| modal has upload and library tabs | Both tabs visible |
| upload tab shows drop zone | Drop zone visible in upload mode |
| can upload an image via file picker | File selection works |
| image preview shows remove button | Remove button on preview |
| clicking remove button clears preview | Preview cleared after remove |
| library tab shows grid or empty | Library mode works |
| cancel button closes modal | Modal can be cancelled |
| attach button disabled without selection | Validation works |
| send button enables with image attached | Can send image-only message |
| attached image preview shows in composer | Preview in composer area |
| can remove attached image from preview | Remove from composer works |
| document button still works | Both attachment types work |
| drag and drop indicator shows | Drag UI feedback works |

## Design Decisions

1. **Markdown storage:** Images stored as standard Markdown syntax for AI agent compatibility
2. **Modal with tabs:** Reuses existing media library, provides familiar UX
3. **Multiple images:** Support for attaching multiple images to single message
4. **Image-only messages:** Send button enables with just images (no text required)
5. **Inline rendering:** Images rendered inline in message bubble, click to expand

## Future Considerations

- Image compression before upload
- Image gallery view for multiple images
- Image annotation/markup
- Inline image resizing
- Copy-paste from web pages
