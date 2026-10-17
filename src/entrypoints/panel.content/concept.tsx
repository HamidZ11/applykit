import { CommandDock } from '@/components/command-dock/CommandDock';
import { FieldInspector } from '@/components/field-inspector/FieldInspector';

/**
 * The panel concept for this build, chosen by the WXT mode (wxt.config.ts).
 * `__APPLYKIT_CONCEPT__` is a compile-time constant, so the unused concept is
 * removed from the bundle.
 */
export const Concept =
  __APPLYKIT_CONCEPT__ === 'field-inspector' ? FieldInspector : CommandDock;
