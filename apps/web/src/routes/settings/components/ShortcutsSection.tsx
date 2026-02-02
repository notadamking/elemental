/**
 * Shortcuts Section component for settings
 *
 * Re-exports the shared ShortcutsSection from @elemental/ui
 * with app-specific defaults.
 */

import { ShortcutsSection as SharedShortcutsSection } from '@elemental/ui';
import { DEFAULT_SHORTCUTS } from '../../../lib/keyboard';

interface ShortcutsSectionProps {
  isMobile: boolean;
}

export function ShortcutsSection({ isMobile }: ShortcutsSectionProps) {
  return <SharedShortcutsSection defaults={DEFAULT_SHORTCUTS} isMobile={isMobile} />;
}
