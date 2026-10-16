import { framesOf, type Beat, type DemoFrame } from "../demo-room/model";
import { AVI, HIMANSHU, YOU } from "../demo-room/people";

const LIMITER = [
  "export function rateLimit({ rate, burst }: Limits) {",
  "  const buckets = new Map<string, Bucket>();",
  "  return (req, res, next) => {",
  "    const ok = take(buckets, req.ip, rate, burst);",
  "    ok ? next() : res.status(429).end();",
  "  };",
];

const FLOOR: DemoFrame = {
  driverId: AVI.id,
  working: true,
  elapsed: 2,
  plan: null,
  turns: [
    {
      id: "t1",
      number: 1,
      by: AVI.id,
      at: "10:41:44",
      text: "Add a token-bucket rate limiter to the API",
      steps: [{ id: "s1", verb: "read", target: "src/router.ts", result: "84 lines", ok: true }],
    },
  ],
  suggestions: [],
  asking: null,
  changes: 0,
};

const BEATS: Beat[] = [
  { ops: [], dwell: 900 },
  {
    ops: [{ turn: "t1", step: { id: "s2", verb: "wrote", target: "src/middleware/rate-limit.ts", code: LIMITER } }],
    dwell: 1500,
  },
  // Arrives mid-write, so one still frame holds the agent, the code and the room.
  { ops: [{ suggest: { id: "g1", by: HIMANSHU.id, text: "Run the tests before we ship it" } }], dwell: 2600 },
  { ops: [{ turn: "t1", settle: "s2", result: "+52" }], dwell: 500 },
  { ops: [{ turn: "t1", step: { id: "s3", verb: "edited", target: "src/router.ts" } }], dwell: 700 },
  { ops: [{ turn: "t1", settle: "s3", result: "+2" }], dwell: 400 },
  {
    ops: [{ finish: "t1", took: "14.2s", at: "10:41:58", reply: "Added the limiter as middleware and wired it into the router." }],
    dwell: 1700,
  },
  { ops: [{ promote: "g1", turn: { id: "t2", number: 2, at: "10:42:06" } }], dwell: 900 },
  { ops: [{ turn: "t2", step: { id: "s4", verb: "ran", target: "pnpm test" } }], dwell: 1000 },
  { ops: [{ turn: "t2", settle: "s4", result: "1 failed", ok: false }], dwell: 700 },
  {
    ops: [{ finish: "t2", took: "3.1s", at: "10:42:10", reply: "One test fails: the bucket never refills after a minute." }],
    dwell: 1500,
  },
  { ops: [{ handOver: YOU.id }], dwell: 1800 },
  {
    ops: [{ prompt: { id: "t3", number: 3, by: YOU.id, at: "10:42:31", text: "Fix the refill and run the tests again" } }],
    dwell: 1900,
  },
  { ops: [{ turn: "t3", step: { id: "s5", verb: "edited", target: "src/middleware/rate-limit.ts" } }], dwell: 800 },
  { ops: [{ turn: "t3", settle: "s5", result: "+3 −2" }], dwell: 400 },
  { ops: [{ turn: "t3", step: { id: "s6", verb: "ran", target: "pnpm test" } }], dwell: 1000 },
  { ops: [{ turn: "t3", settle: "s6", result: "6 passed" }], dwell: 600 },
  {
    ops: [
      {
        finish: "t3",
        took: "9.4s",
        at: "10:42:44",
        reply: "Fixed. The refill compared against the wrong clock, and all 6 tests pass.",
      },
    ],
    dwell: 4000,
  },
];

export const LAB = {
  people: [AVI, HIMANSHU, YOU],
  selfId: YOU.id,
  frames: framesOf(FLOOR, BEATS),
  dwells: BEATS.map((b) => b.dwell),
  // First paint and the reduced-motion frame: the agent writing code for Avi
  // while Himanshu's suggestion waits above his seat.
  start: 2,
};
