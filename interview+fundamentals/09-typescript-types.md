# TypeScript Types — Compile Time vs Runtime

The one sentence to memorise:

> **Types are erased before your code ever runs. At runtime, TypeScript does not exist.**

Everything below follows from that.

---

### Q: What actually happens to a type when you build?

**A:** It is deleted. `tsc` checks your types, then throws them away and emits plain
JavaScript. There is no type information left in `dist/`.

`packages/shared` is the clean proof. It contains **53 `export type` declarations and zero
runtime exports** — one file, no functions, no constants. Every import of it across the repo
is `import type`.

The consequence, verified by grepping the compiled output: **`dist/` contains no reference to
`@relay/shared` at all.** It vanished. That is why publishing the CLI to npm needed no
bundler — a package that produces no runtime code cannot be a runtime dependency, so it moved
to `devDependencies` and nothing broke.

*A type is a note to the compiler. The compiler reads it, acts on it, and bins it.*

### Q: So what are types actually for?

**A:** Catching mistakes *before* the code runs, and describing intent to the next person.
Not validating data.

In this repo, `shared/protocol.ts` is a **contract between three programs**: the server, the
agent CLI, and the web app all compile against it. Change `RunnerHelloMessage` and every side
that disagrees fails to compile. That is the entire value — it makes "one side sends something
the other doesn't understand" a build error rather than a 3am production mystery.

### Q: The important one — what does a type NOT protect you from?

**A:** Anything that arrives at runtime from outside your program. Network data, JSON,
`localStorage`, environment variables, user input.

Here is the real line from `ws.ts`:

```ts
parsed = JSON.parse(raw.toString());   // parsed is `any`
const msg = parsed as ClientMessage;   // ← a promise, not a check
```

`JSON.parse` returns `any`. The `as ClientMessage` cast tells the compiler *"trust me, this
is a ClientMessage."* The compiler does trust it, and from that point on gives you perfect
autocomplete on a value **it has never verified**.

At runtime that WebSocket frame could be `{"type":"instruct"}` with no `text` field, or
`null`, or a 100,000-character display name. TypeScript is gone by then and stops nothing.

**This is why `validate.ts` exists.** The type says what the message *should* be; the
validator checks what it *actually is*. You need both, and they are doing genuinely different
jobs — one at build time, one at runtime.

If an interviewer asks "how do you validate input in TypeScript?", the wrong answer is "the
types handle it." The right answer names the boundary: types inside the program, runtime
validation at every edge where data enters it.

### Q: When should you write a type versus just letting it be inferred?

**A:** Default to inference. Write an explicit type when it is a **boundary or a contract**:

| Write the type | Let it infer |
|---|---|
| Anything crossing the wire (`protocol.ts`) | Local variables |
| Function parameters | Return values of small functions |
| Anything exported from a module | Intermediate values in a function body |
| A shape several files must agree on | Anything obvious from the right-hand side |

`const n = 5` needs no annotation — writing `const n: number = 5` is noise. But every message
in `protocol.ts` is annotated, because three separate programs have to agree on it.

*Annotate the edges. Let the middle infer.*

### Q: `type` or `interface`?

**A:** For this codebase, `type` — consistently. It handles unions, which `interface` cannot,
and `ClientMessage` is a union of every possible message:

```ts
export type ClientMessage = JoinMessage | InstructMessage | StopMessage | ...;
```

`interface` has one real advantage — declaration merging, where two declarations of the same
interface combine. That is genuinely useful for augmenting library types, and a footgun
everywhere else. Pick one and stay consistent; mixing them arbitrarily is the actual mistake.

### Q: What is a discriminated union, and why is it everywhere here?

**A:** A union where each member has a shared literal field that tells them apart — here,
`type`. It lets the compiler narrow to the right shape from a plain `switch`:

```ts
switch (msg.type) {
  case "instruct":
    msg.text;             // ✓ compiler knows InstructMessage has .text
    break;
  case "hand_over":
    msg.toParticipantId;  // ✓ different shape, no cast needed
    break;
}
```

Two things this buys beyond convenience. First, no casts inside the branches — the narrowing
is proven, not asserted. Second, **exhaustiveness**: add a new message to the union and every
`switch` that doesn't handle it can be made to fail at compile time. The protocol grows and
the compiler finds every place that needs updating.

### Q: Why `import type` instead of a plain `import`?

**A:** It states that the import is erased, and guarantees it.

```ts
import type { EventKind, SessionStatus } from "@relay/shared";
```

A plain `import` of something used only as a type *usually* gets elided, but bundlers and
transpilers that compile file-by-file can't always tell, and may emit a real `require` for a
module with no runtime code. `import type` removes the ambiguity: it is a compile-error to use
that binding as a value, and the statement always disappears.

That is exactly why the agent CLI publishes cleanly with `@relay/shared` in `devDependencies`.

### Q: How do you get a runtime value and a type to stay in sync?

**A:** Derive the type from the value, never the other way around. Write the runtime thing
first, then `typeof` / `keyof` it:

```ts
const STATUS_VARIANT = {
  idle: "", working: "badge--live", done: "badge--ok", error: "badge--error",
} as const;

type Status = keyof typeof STATUS_VARIANT;   // "idle" | "working" | "done" | "error"
```

Now the type cannot drift from the object, because it *is* the object. Declaring both by hand
means two things that must be kept in step manually — and one day won't be.

### Q: Give me the summary I can recite.

**A:**

1. **Types are erased.** At runtime, TypeScript is not there.
2. **`as` is a promise, not a check.** It silences the compiler; it verifies nothing.
3. **Validate at every boundary** where data enters the program — network, JSON, env, storage.
4. **Annotate edges, infer the middle.**
5. **Discriminated unions** turn runtime branching into compile-time proof.
6. **Derive types from values** so they cannot drift.
