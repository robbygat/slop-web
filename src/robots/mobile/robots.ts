import type { Shell } from './scene/shells/common';
import { createClicky, createCore, createGatekeeper, createNeko, createNoir } from './scene/shells/heads';
import { createBlocky, createChip, createFieldMarshal, createHomebody, createStageDoor, createStamp } from './scene/shells/special';
import { createBassline, createCarat, createBrewster, createHivemind, createPrickles, createQuackers, createUpdraft, createWobble, createCoinOp, createDrizzle, createGlowcap, createGumdrop, createLiftoff, createRawr, createSaucer, createToasty } from './scene/shells/toybox';
import type { FinishId } from './paint';

export { FINISHES, FINISH_IDS, type FinishId } from './paint';

/** The app's shell ids (stable: they're saved on profiles). */
const MAKERS = {
  core: createCore,
  neko: createNeko,
  clicky: createClicky,
  gatekeeper: createGatekeeper,
  noir: createNoir,
  blocky: createBlocky,
  chip: createChip,
  'stage-door': createStageDoor,
  marshal: createFieldMarshal,
  stamp: createStamp,
  homebody: createHomebody,
  // the Toybox (appended: ids are saved on profiles, order is the app's enum order)
  'coin-op': createCoinOp,
  bassline: createBassline,
  saucer: createSaucer,
  gumdrop: createGumdrop,
  liftoff: createLiftoff,
  carat: createCarat,
  drizzle: createDrizzle,
  toasty: createToasty,
  rawr: createRawr,
  glowcap: createGlowcap,
  updraft: createUpdraft,
  wobble: createWobble,
  brewster: createBrewster,
  prickles: createPrickles,
  hivemind: createHivemind,
  quackers: createQuackers,
} satisfies Record<string, (f: FinishId) => Shell>;

export type ShellId = keyof typeof MAKERS;
export const SHELL_IDS = Object.keys(MAKERS) as ShellId[];

export function makeShell(id: ShellId, finish: FinishId): Shell {
  return MAKERS[id](finish);
}
