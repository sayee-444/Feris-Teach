/**
 * The classroom's public types, re-exported from its entry, `index.js`. Types that only the
 * classroom's own code needs live beside that code.
 */

/**
 * A book's index: its `index.json`, the map of the book and the only part of it the teacher
 * always loads. Files are paths from the book's folder, written with `/`.
 *
 * @typedef {object} BookIndex
 * @property {string} title The book's title
 * @property {string} language The language the book is written in, as a BCP 47 tag ("en", "es")
 * @property {Chapter[]} chapters The chapters, in reading order
 * @property {string} glossary The glossary page
 * @property {ReferencePage[]} reference The reference pages, in order
 */

/**
 * A part of a book that groups related lessons.
 *
 * @typedef {object} Chapter
 * @property {string} title
 * @property {Lesson[]} lessons The chapter's lessons, in reading order
 */

/**
 * A lesson as the index lists it.
 *
 * @typedef {object} Lesson
 * @property {string} id Names the lesson within its book; it never changes once given
 * @property {string} title The lesson's title, the same as the `<title>` of its page
 * @property {string} file The lesson's page
 * @property {LessonStatus} status Whether the page is written yet
 */

/**
 * `planned`: the lesson is in the book's plan and its page is not written yet.
 * `ready`: its page is written and the classroom shows it.
 *
 * @typedef {"planned" | "ready"} LessonStatus
 */

/**
 * A reference page: a cheat sheet the student looks things up in.
 *
 * @typedef {object} ReferencePage
 * @property {string} title The page's title, the same as its `<title>`
 * @property {string} file
 */

/**
 * What the book checker found: the index when it could be read, and every mismatch between the
 * index and what is on disk, each a line naming the file it is about. No mismatch means the
 * book is sound.
 *
 * @typedef {object} BookCheck
 * @property {BookIndex | undefined} index
 * @property {string[]} mismatches
 */

/**
 * Where the classroom serves and what.
 *
 * @typedef {object} ClassroomOptions
 * @property {string[]} booksDirs Folders that hold books, one subfolder per book. When two hold
 *   a book of the same name, the first one wins.
 * @property {number} [port] The port on localhost; when it is taken, the classroom fails. Leave
 *   it out for any free port.
 */

/**
 * What the student is looking at and has answered: the classroom state, which the teacher reads
 * in one call. Pages are paths in the classroom (`/books/<book>/<file>`); sections, paragraphs
 * and quizzes are named by their `id` in the page.
 *
 * @typedef {object} ClassroomState
 * @property {string | null} page The page on screen, or nothing when the classroom is not open
 * @property {string | null} book The name of the book that page belongs to, if any
 * @property {string | null} lesson The id of the lesson that page is, by the book's index, if it
 *   is one
 * @property {View} view
 * @property {Selection | null} selection The text the student has selected, if any
 * @property {Answer[]} answers Every quiz answer of the class, in the order they were given
 */

/**
 * The part of the page the student has on screen: the sections and the paragraphs of which some
 * part is in sight, in the order of the page. A paragraph is any element with an `id` right
 * inside a section with an `id`: a paragraph, a note, a list, a table, a figure, a quiz.
 *
 * @typedef {object} View
 * @property {string[]} sections
 * @property {string[]} paragraphs
 */

/**
 * Text the student has selected.
 *
 * @typedef {object} Selection
 * @property {string} text
 * @property {string | null} within The id of the paragraph, or else of the section, where the
 *   selection starts
 */

/**
 * One answer to a quiz or a prediction.
 *
 * @typedef {object} Answer
 * @property {string} page The page the quiz is on
 * @property {string | null} book
 * @property {string | null} lesson
 * @property {string | null} quiz The quiz's id, when it has one
 * @property {string} question The quiz's question, as text
 * @property {string} answer The option the student chose, or the number they typed
 * @property {boolean} correct
 */

/**
 * A classroom being served.
 *
 * @typedef {object} Classroom
 * @property {string} url The classroom's home page
 * @property {() => Promise<void>} close Stops serving
 */

export {};
