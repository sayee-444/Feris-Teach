/**
 * The classroom's entry: everything another part may import from it, as `#classroom`
 * (ADR-0003).
 *
 * The classroom is the local web page where the visual part of the class happens. It serves the
 * books on localhost with live reload, and it knows the shape of a book: its index, its lessons,
 * its glossary and its reference.
 */

export { checkBook } from "./lib/book.js";
export { startClassroom } from "./lib/server.js";

/**
 * @typedef {import("./types.js").BookCheck} BookCheck
 * @typedef {import("./types.js").BookIndex} BookIndex
 * @typedef {import("./types.js").Chapter} Chapter
 * @typedef {import("./types.js").Classroom} Classroom
 * @typedef {import("./types.js").ClassroomOptions} ClassroomOptions
 * @typedef {import("./types.js").Lesson} Lesson
 * @typedef {import("./types.js").LessonStatus} LessonStatus
 * @typedef {import("./types.js").ReferencePage} ReferencePage
 */
