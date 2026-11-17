/**
 * The toolbelt's public types, re-exported from its entry, `index.js`. Types that only the
 * toolbelt's own code needs live beside that code.
 */

/**
 * A scenario that checks itself.
 *
 * @typedef {object} AutomaticScenario
 * @property {"automatic"} kind
 * @property {string} title One line saying what the scenario shows
 * @property {(tools: Tools) => void | Promise<void>} check Throws, with a clear message, when
 *   the part under trial does not behave
 */

/**
 * A scenario only a human can judge.
 *
 * @typedef {object} HumanScenario
 * @property {"human"} kind
 * @property {string} title One line saying what the scenario shows
 * @property {(tools: Tools) => void | Promise<void>} present Shows the human what to judge
 * @property {string[]} checklist What the human looks for before rating
 */

/**
 * What a scenario's folder holds: the default export of its `scenario.js`.
 *
 * @typedef {AutomaticScenario | HumanScenario} Scenario
 */

/**
 * What the lab hands to a scenario.
 *
 * @typedef {object} Tools
 * @property {(...args: string[]) => { status: number | null, stdout: string, stderr: string }} feris
 *   Runs the toolbelt the way the teacher does, as a separate process
 */

export {};
