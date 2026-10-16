import { framesOf, type Beat, type DemoFrame, type DemoPlan } from "./model";
import { AVI, HIMANSHU } from "./people";

const BUILD = [
  { content: "Read the router", doing: "Reading the router" },
  { content: "Write the limiter", doing: "Writing the limiter" },
  { content: "Wire it into the router", doing: "Wiring it into the router" },
];
const plan = (done: number): { plan: DemoPlan } => ({
  plan: { steps: BUILD, done, active: done < BUILD.length },
});

const FLOOR: DemoFrame = {
  driverId: AVI.id,
  working: true,
  elapsed: 3,
  plan: { steps: BUILD, done: 1, active: true },
  turns: [
    {
      id: "t1",
      number: 1,
      by: AVI.id,
      at: "10:41:44",
      text: "Add a token-bucket rate limiter to the API",
      steps: [{ id: "s1", verb: "read", target: "src/router.ts", result: "84 lines", ok: true, took: "0.1s" }],
    },
  ],
  suggestions: [],
  asking: null,
  changes: 0,
};

const BEATS: Beat[] = [
  { ops: [], dwell: 800 },
  { ops: [{ turn: "t1", step: { id: "s2", verb: "wrote", target: "src/middleware/rate-limit.ts" } }], dwell: 900 },
  { ops: [{ turn: "t1", settle: "s2", result: "written", took: "1.4s" }, { changes: 1 }, plan(2)], dwell: 600 },
  { ops: [{ ask: HIMANSHU.id }], dwell: 2400 },
  // Mid-run on purpose: the server has no busy check on a handover.
  { ops: [{ handOver: HIMANSHU.id }], dwell: 2200 },
  { ops: [{ turn: "t1", step: { id: "s3", verb: "edited", target: "src/router.ts" } }], dwell: 700 },
  { ops: [{ turn: "t1", settle: "s3", result: "applied", took: "0.6s" }, { changes: 2 }, plan(3)], dwell: 500 },
  {
    ops: [
      {
        finish: "t1",
        took: "9.8s",
        at: "10:41:58",
        reply: "Added the limiter as middleware and wired it into the router.",
      },
    ],
    dwell: 1100,
  },
  { ops: [{ prompt: { id: "t2", number: 2, by: HIMANSHU.id, at: "10:42:05", text: "Run the tests before we ship it" } }], dwell: 900 },
  { ops: [{ turn: "t2", step: { id: "s4", verb: "ran", target: "pnpm test" } }], dwell: 900 },
  { ops: [{ turn: "t2", settle: "s4", result: "18 lines", took: "2.0s" }], dwell: 500 },
  { ops: [{ finish: "t2", took: "6.1s", at: "10:42:12", reply: "All 6 tests pass." }], dwell: 3600 },
];

export const TWO = {
  people: [AVI, HIMANSHU],
  frames: framesOf(FLOOR, BEATS),
  dwells: BEATS.map((b) => b.dwell),
  // First paint and the reduced-motion frame: Himanshu has asked, so the two screens
  // already differ, Avi's with the request and Himanshu's waiting on it.
  start: 3,
};
