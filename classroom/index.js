/**
 * The classroom's entry: everything another part may import from it, as `#classroom`
 * (ADR-0003).
 *
 * The classroom is the local web page where the visual part of the class happens. It serves the
 * books on localhost with live reload, and it knows the shape of a book: its index, its lessons,
 * its glossary and its reference, and it tells what the student has on screen and has answered.
 * The teacher opens its pages and points at what is on them.
 */

export { checkBook } from "./lib/book.js";
export { ClassroomRefusal, openPage, pointAt } from "./lib/orders.js";
export { startClassroom } from "./lib/server.js";
export { classroomState } from "./lib/state.js";

/**
 * @typedef {import("./types.js").Answer} Answer
 * @typedef {import("./types.js").BookCheck} BookCheck
 * @typedef {import("./types.js").BookIndex} BookIndex
 * @typedef {import("./types.js").Chapter} Chapter
 * @typedef {import("./types.js").Classroom} Classroom
 * @typedef {import("./types.js").ClassroomOptions} ClassroomOptions
 * @typedef {import("./types.js").ClassroomState} ClassroomState
 * @typedef {import("./types.js").Lesson} Lesson
 * @typedef {import("./types.js").LessonStatus} LessonStatus
 * @typedef {import("./types.js").ReferencePage} ReferencePage
 * @typedef {import("./types.js").Selection} Selection
 * @typedef {import("./types.js").View} View
 */
