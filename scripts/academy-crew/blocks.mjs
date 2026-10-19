// Block builders for the crew-life courses (guest privacy, UAE, respect on board,
// wellbeing) — the AV/IT helpers, plus doc() for a PDF block.
import { id } from "../academy-avit/blocks.mjs";

export * from "../academy-avit/blocks.mjs";
export const doc = (file, title) => ({ id: id(), type: "document", mediaId: `@${file}`, title });
