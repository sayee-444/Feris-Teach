# The classroom is one page, with the book in a frame

The classroom is a single page, the **shell**, that stays open and never reloads for the whole class. It holds the bar and a frame named `lesson`, and every page of a book (the list of books, a book's index page, its lessons, glossary and reference) shows inside that frame. Moving around the book and live reload change only the frame. We chose this because the persona's avatar (cut 2) and the class's state must last the whole class: an avatar that restarts on every click, or quiz answers forgotten when the student turns the page, would break the class.

The shell is served without Vite's client, so no reload Vite sends can reach it. Its address follows the page in the frame (`/#/books/…`), so a reload or a bookmark comes back to the same page, and a book's page opened on its own moves into the shell. Lessons stay plain HTML files, as the preparer writes them, and the frame keeps their styles and scripts away from the shell's.

## Considered Options

- **One page per lesson, as before**: the simplest, but every click and every live reload starts the page again, and anything living in it with it.
- **Swapping the page's content in place** (fetch a lesson and replace `<main>`, as Turbo or htmx do): one document, but each lesson's scripts must be run again by hand, and its styles reach the shell and the avatar.
- **A framework (React or similar)**: lessons would become components, which the preparer would have to write instead of plain HTML. The spec asks for no framework, and the frame solves the problem without one.

## Consequences

- What must last the class lives outside the page in the frame, which any click or live reload starts again. The shell holds what the student sees all class long: the bar and, later, the persona's avatar. The classroom state of #5 (view, selection, quiz answers) is gathered by the shell, which reads the page in the frame: both are served from the same origin, so the shell can reach into the frame. The shell reports it to the classroom's server, which holds it for as long as the classroom runs, the length of the class. The teacher's toolbelt runs as a separate process and reads it there, and the shell reloading forgets no answer.
- Pointing and opening (#6) act on the frame: opening a page is navigating the frame; pointing at an element is reaching into the page it shows.
- The bar belongs to the shell. The classroom serves it at `/shell/bar?page=<path>`, and the shell asks for it each time the frame loads a page.
- A link that leaves the classroom opens in a new tab, never in the frame.
