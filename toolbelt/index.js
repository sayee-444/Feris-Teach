/**
 * The toolbelt's entry: everything another part may import from it, as `#toolbelt` (ADR-0003).
 *
 * The toolbelt itself is driven as a separate process, `bin/feris.js`, so what it shares with
 * the other parts is types: the shape of the lab's scenarios and of the tools they receive.
 */

/**
 * @typedef {import("./types.js").AutomaticScenario} AutomaticScenario
 * @typedef {import("./types.js").HumanScenario} HumanScenario
 * @typedef {import("./types.js").Scenario} Scenario
 * @typedef {import("./types.js").Tools} Tools
 */

export {};
