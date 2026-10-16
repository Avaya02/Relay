import { framesOf, type Beat, type DemoFrame, type DemoPlan } from "./model";
import { AVI, HIMANSHU, YOU } from "./people";

const BUILD = [
  { content: "Read the router", doing: "Reading the router" },
  { content: "Write the limiter and its tests", doing: "Writing the limiter and its tests" },
  { content: "Wire it into the router", doing: "Wiring it into the router" },
];
const REFILL = [
  { content: "Add the refill test", doing: "Adding the refill test" },
  { content: "Run the tests", doing: "Running the tests" },
  { content: "Fix what fails", doing: "Fixing what fails" },
];
const plan = (steps: DemoPlan["steps"], done: number): { plan: DemoPlan } => ({
  plan: { steps, done, active: done < steps.length },
});

// Avi's prompt has just landed. Plan updates show in the plan bar rather than as
// rows: a frame this size can't spare the room the session page gives them.
const FLOOR: DemoFrame = {
  driverId: AVI.id,
  working: true,
  elapsed: 1,
  plan: null,
  turns: [
    {
      id: "t1",
      number: 1,
      by: AVI.id,
      at: "10:41:44",
      text: "Add a token-bucket rate limiter to the API, with tests",
      steps: [],
    },
  ],
  suggestions: [],
  asking: null,
  changes: 0,
};

const BEATS: Beat[] = [
  { ops: [], dwell: 800 },
  { ops: [plan(BUILD, 0), { turn: "t1", step: { id: "s1", verb: "read", target: "src/router.ts" } }], dwell: 700 },
  {
    ops: [{ suggest: { id: "g1", by: HIMANSHU.id, text: "Also test that the bucket refills after a minute" } }],
    dwell: 1700,
  },
  { ops: [{ turn: "t1", settle: "s1", result: "84 lines", took: "0.1s" }, plan(BUILD, 1)], dwell: 600 },
  { ops: [{ turn: "t1", step: { id: "s2", verb: "wrote", target: "src/middleware/rate-limit.ts" } }], dwell: 800 },
  { ops: [{ turn: "t1", settle: "s2", result: "written", took: "1.4s" }, { changes: 1 }], dwell: 500 },
  { ops: [{ turn: "t1", step: { id: "s3", verb: "wrote", target: "test/rate-limit.test.ts" } }], dwell: 700 },
  { ops: [{ turn: "t1", settle: "s3", result: "written", took: "1.1s" }, { changes: 2 }, plan(BUILD, 2)], dwell: 500 },
  { ops: [{ turn: "t1", step: { id: "s4", verb: "edited", target: "src/router.ts" } }], dwell: 700 },
  { ops: [{ turn: "t1", settle: "s4", result: "applied", took: "0.6s" }, { changes: 3 }, plan(BUILD, 3)], dwell: 500 },
  {
    ops: [
      {
        finish: "t1",
        took: "14.2s",
        at: "10:41:58",
        reply: "Added a token-bucket limiter as middleware, wired it into the router, and covered it with tests.",
      },
    ],
    dwell: 1400,
  },
  { ops: [{ promote: "g1", turn: { id: "t2", number: 2, at: "10:42:06" } }], dwell: 1000 },
  {
    ops: [plan(REFILL, 0), { turn: "t2", step: { id: "s5", verb: "edited", target: "test/rate-limit.test.ts" } }],
    dwell: 700,
  },
  { ops: [{ turn: "t2", settle: "s5", result: "applied", took: "0.4s" }, plan(REFILL, 1)], dwell: 400 },
  { ops: [{ turn: "t2", step: { id: "s6", verb: "ran", target: "pnpm test" } }], dwell: 900 },
  {
    ops: [
      {
        turn: "t2",
        settle: "s6",
        ok: false,
        result: "FAIL test/rate-limit.test.ts > refills after a minute",
        took: "2.3s",
      },
      plan(REFILL, 2),
    ],
    dwell: 1300,
  },
  { ops: [{ handOver: YOU.id }], dwell: 1900 },
  { ops: [{ turn: "t2", step: { id: "s7", verb: "edited", target: "src/middleware/rate-limit.ts" } }], dwell: 700 },
  { ops: [{ turn: "t2", settle: "s7", result: "applied", took: "0.5s" }], dwell: 400 },
  { ops: [{ turn: "t2", step: { id: "s8", verb: "ran", target: "pnpm test" } }], dwell: 900 },
  { ops: [{ turn: "t2", settle: "s8", result: "24 lines", took: "2.1s" }, plan(REFILL, 3)], dwell: 500 },
  {
    ops: [
      {
        finish: "t2",
        took: "11.6s",
        at: "10:43:02",
        reply: "The refill compared against the wrong clock. Fixed, and all 6 tests pass.",
      },
    ],
    dwell: 3800,
  },
];

export const HERO = {
  people: [AVI, HIMANSHU, YOU],
  selfId: YOU.id,
  frames: framesOf(FLOOR, BEATS),
  dwells: BEATS.map((b) => b.dwell),
  // First paint, and all that reduced motion shows: Avi's prompt, the agent's
  // first step, Himanshu's suggestion waiting for him.
  start: 2,
};
