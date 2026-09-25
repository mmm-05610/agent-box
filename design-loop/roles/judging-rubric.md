# Judging rubric (authoritative for every role in this loop)

## What wins

A candidate wins by satisfying the required scenarios and their invariants under
the smallest **total** cost — core + adapter burden + extension-author burden.
Not by having the fewest files, not by self-scoring, not by naming things well.

## The three tests every candidate must pass

1. **Coverage** — S01–S12 each has a concrete trajectory with a named owner and
   a stated deletion consequence. No "later" slots.
2. **Non-smuggling** — the core is not a service/model/harness/conversation
   assumption wearing a neutral name.
3. **Minimality** — every core mechanism has a "deleting it breaks scenario X"
   argument. If the argument is missing, the mechanism is deleted.

## Disqualifiers (each ends the candidate, not just the section)

* `execute(any)` and any other untyped escape hatch.
* An omnipotent `context` object handed to extensions.
* An arbitrary event bus used as the extension mechanism.
* Complexity relocated into a plugin so the core *looks* minimal.
* Faking support for a capability the service does not have.
* Reinterpreting, weakening or dropping a required scenario.
* A trajectory that only works when every adapter is the one we already have.

## What counts as evidence

* A specific event sequence beats an adjective.
* An existing artifact beats an assertion about one.
* A model experiment proves **the model only**. It is never product verification,
  never protocol verification, never "the design works".
* This repository's current code is a migration constraint and evidence about the
  problem space. It is not the answer and not the baseline a candidate must keep.
* Anything marked "unverified" in the inputs stays marked unverified in outputs.

## Honest outcomes

* Two candidates that cannot be simply ranked may both stay; say so, and say what
  observation would rank them.
* "I could not break it" and "it is correct" are different claims. Use the first.
* A clean round is a real result only if the attack dimension was actually taken
  up. Record which dimension was used, always.
