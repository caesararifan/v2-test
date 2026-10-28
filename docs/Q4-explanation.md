# Q4 – Troubleshoot & Explain

```js
function getTotalUsageMB(records) {
  return records.reduce((total, record) => {
    total += record.dataUsageMB;
  });
}
```

## Root cause

There are two defects in the `reduce` call. The first is the one that produces the visible failure; the second makes it worse.

1. **The callback never `return`s the accumulator (primary root cause).**
   `reduce` uses the callback's return value as `total` for the next iteration. The callback only does `total += ...`, which changes the local parameter and returns `undefined`. So after the first iteration `total` is `undefined`, and `undefined + 1200` is `NaN`. `getTotalUsageMB` returns whatever `reduce` returns, which is the last callback result: `undefined`.

2. **No initial value is passed to `reduce`.**
   Without a second argument, `reduce` uses `records[0]` – the whole *object* – as the first `total` and starts iterating at index 1. So the first `total += record.dataUsageMB` is `{...} + 1200`, which JavaScript turns into the string `"[object Object]1200"` instead of a number. Other consequences of the missing initial value:
   - `[]` → throws `TypeError: Reduce of empty array with no initial value`.
   - `[{dataUsageMB: 42}]` → the callback is never called and the function returns the record object itself (`{dataUsageMB: 42}`), not `42`.

Example with the sample data (`[{dataUsageMB:1500},{dataUsageMB:1200},{dataUsageMB:500}]`): the result is `undefined`, not `3200`.

## Fix

```js
function getTotalUsageMB(records) {
  if (!Array.isArray(records)) throw new TypeError('records must be an array');
  return records.reduce((total, record, index) => {
    const mb = record?.dataUsageMB;
    if (typeof mb !== 'number' || !Number.isFinite(mb)) {
      throw new TypeError(`records[${index}].dataUsageMB must be a finite number, got ${mb}`);
    }
    return total + mb;   // 1) return the new accumulator
  }, 0);                 // 2) explicit numeric initial value
}
```

The minimal fix is just `return total + record.dataUsageMB` and `, 0`. I also validate the input so bad data fails loudly with a useful message (`records[2].dataUsageMB must be a finite number`) rather than silently producing `NaN` or a string like `"15001200"` (which is what `"1200"` + `1500` would give for API data sent as strings). Empty input returns `0`, which is the correct total.

Implementation: [`q4/getTotalUsageMB.js`](../q4/getTotalUsageMB.js). Tests covering the normal case, single record, empty array, decimals and invalid input are in [`test/scripts.test.js`](../test/scripts.test.js).

## Why it broke

Arrow functions with a **block body** (`{ ... }`) do not return implicitly – only expression bodies (`x => x + 1`) do. Writing `total += x` as a statement looks like it "updates the total", which is true for a `for` loop with an outer variable, but `reduce` is functional: it only cares about what you *return*. The missing initial value is a second, independent trap that JavaScript doesn't warn about, because omitting it is legal; it just changes the types silently.

## How to prevent this class of bug

- **Lint rules:** enable ESLint `array-callback-return`; it flags a `reduce` callback that doesn't return a value on every path, so it would have caught this at commit time. Teams that find `reduce` error-prone can also restrict it with `unicorn/no-array-reduce`.
- **Always pass an initial value** to `reduce` – make it a review/lint convention. It fixes empty-array crashes and makes the accumulator type obvious.
- **Static typing:** TypeScript (or JSDoc + `// @ts-check`) flags both problems: `(total: number, record: Usage) => number` fails to compile when the callback returns `void`, and `total += record.dataUsageMB` on an object accumulator is a type error.
- **Unit tests for edge cases**, not only the happy path: empty array, one element, many elements, invalid element. This repo has them in `test/scripts.test.js`; the single-element and empty cases both fail against the original code.
- **Validate data at the boundary** (as the API does in `src/validate.js`), so internal functions can rely on numbers, and keep a simple `for...of` loop where `reduce` hurts readability.
- **CI** running lint + tests on every pull request so these checks can't be skipped.
