/**
 * Quizzes with immediate feedback: single choice, and prediction, where the student types a
 * number before seeing the answer. The classroom adds this script to every page of a book.
 *
 * Single choice:
 *
 *   <div class="quiz">
 *     <p class="question">The question</p>
 *     <div class="options"><button>A</button><button data-correct>B</button></div>
 *     <p class="explanation">Why B is right.</p>
 *   </div>
 *
 * Prediction:
 *
 *   <div class="prediction" data-answer="3">
 *     <p class="question">How many…?</p>
 *     <p class="explanation">Shown once the student answers.</p>
 *   </div>
 *
 * An empty <span class="score"></span> shows right answers out of those answered.
 */

/** What the quiz says, in the languages it speaks; a page in another language gets English. */
const WORDS = {
	en: {
		check: "Check",
		right: (/** @type {string} */ answer) => `Exactly! ${answer}`,
		wrong: (/** @type {string} */ answer) => `It is ${answer}`,
		score: (
			/** @type {number} */ right,
			/** @type {number} */ answered,
			/** @type {number} */ total,
		) => `${right} / ${answered} of ${total}`,
	},
	es: {
		check: "Comprobar",
		right: (/** @type {string} */ answer) => `¡Exacto! ${answer}`,
		wrong: (/** @type {string} */ answer) => `Es ${answer}`,
		score: (
			/** @type {number} */ right,
			/** @type {number} */ answered,
			/** @type {number} */ total,
		) => `${right} / ${answered} de ${total}`,
	},
};

const language = /** @type {keyof typeof WORDS} */ (document.documentElement.lang.split("-")[0]);
const words = WORDS[language] ?? WORDS.en;

const total = document.querySelectorAll(".quiz, .prediction").length;
const score = document.querySelector(".score");
let right = 0;
let answered = 0;

/** Counts one answer and shows the score. */
function count(/** @type {boolean} */ ok) {
	answered++;
	if (ok) right++;
	if (score) score.textContent = words.score(right, answered, total);
}
if (score && total > 0) score.textContent = words.score(0, 0, total);

for (const quiz of document.querySelectorAll(".quiz")) {
	const buttons = quiz.querySelectorAll(".options button");
	for (const button of buttons) {
		button.addEventListener("click", () => {
			if (quiz.classList.contains("answered")) return;
			const ok = button.hasAttribute("data-correct");
			button.classList.add(ok ? "correct" : "incorrect");
			for (const other of buttons) {
				if (other.hasAttribute("data-correct")) other.classList.add("correct");
				/** @type {HTMLButtonElement} */ (other).disabled = true;
			}
			quiz.classList.add("answered");
			count(ok);
		});
	}
}

for (const prediction of document.querySelectorAll(".prediction")) {
	const answer = /** @type {HTMLElement} */ (prediction).dataset.answer ?? "";
	const row = document.createElement("div");
	const input = document.createElement("input");
	input.type = "number";
	input.step = "any";
	input.placeholder = "?";
	const button = document.createElement("button");
	button.type = "button";
	button.textContent = words.check;
	const verdict = document.createElement("span");
	verdict.className = "verdict";
	row.append(input, " ", button, verdict);
	prediction.insertBefore(row, prediction.querySelector(".explanation"));

	const check = () => {
		if (prediction.classList.contains("answered") || input.value === "") return;
		const ok = Number(input.value) === Number(answer);
		verdict.textContent = ok ? words.right(answer) : words.wrong(answer);
		verdict.className = `verdict ${ok ? "right" : "wrong"}`;
		input.disabled = true;
		button.disabled = true;
		prediction.classList.add("answered");
		count(ok);
	};
	button.addEventListener("click", check);
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") check();
	});
}
