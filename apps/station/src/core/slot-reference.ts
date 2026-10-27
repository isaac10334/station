import { z } from "zod";
/** A reference to a live slot in this desk, never a source asset or authority.
 * Removed slots remain missing rather than silently retargeting their callers. */
export const slotReferenceSchema = z.object({ surface: z.enum(["main", "dashboard", "sidebar", "bottom", "toolbar"]), ownerId: z.string().min(1).optional(), nodeId: z.string().min(1) }).strict();
export type SlotReference = z.infer<typeof slotReferenceSchema>;
export const SLOT_DRAG_TYPE = "application/x-station-slot-reference";
