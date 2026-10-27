/** Observable palette state shared by any renderer; search ranking remains a pure projection. */
import { createUiController } from "@loop-kit/ui";
export type PaletteAction =
  | { type: "open"; query?: string }
  | { type: "close" }
  | { type: "query"; query: string };
export function createPaletteController() {
  return createUiController(
    { open: false, query: "" },
    (state, action: PaletteAction) => {
      switch (action.type) {
        case "open":
          return { open: true, query: action.query ?? state.query };
        case "close":
          return { ...state, open: false };
        case "query":
          return { ...state, query: action.query };
      }
    },
  );
}
