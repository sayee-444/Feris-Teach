/**
 * Token chips: shows how a text splits into tokens, one chip per token with its id. The
 * classroom adds this script to every page of a book.
 *
 *   <div class="tokens" data-tokens='[[65717,"Hello"],[27429," world"]]'></div>
 *
 * Each pair is [id, piece]. A piece that starts with "0x" is shown as loose bytes: part of a
 * UTF-8 character that is not text on its own. data-special="248045,248046" marks those ids as
 * special tokens.
 */

/** A piece with its spaces, line breaks and tabs made visible. */
function visible(/** @type {string} */ piece) {
	return piece.replace(/ /g, "·").replace(/\n/g, "↵").replace(/\t/g, "→");
}

for (const holder of document.querySelectorAll(".tokens[data-tokens]")) {
	const { tokens = "[]", special = "" } = /** @type {HTMLElement} */ (holder).dataset;
	/** @type {[number, string][]} */
	const pairs = JSON.parse(tokens);
	const specials = special.split(",").filter(Boolean).map(Number);
	pairs.forEach(([id, piece], i) => {
		const chip = document.createElement("span");
		const bytes = piece.startsWith("0x");
		chip.className = `chip c${i % 4}`;
		if (specials.includes(id)) chip.classList.add("special");
		if (bytes) chip.classList.add("bytes");
		const text = document.createElement("span");
		text.className = "piece";
		text.textContent = bytes ? piece : visible(piece);
		const number = document.createElement("span");
		number.className = "id";
		number.textContent = String(id);
		chip.append(text, number);
		chip.title = `id ${id} → ${JSON.stringify(piece)}`;
		holder.append(chip);
	});
	const count = document.createElement("span");
	count.className = "total";
	count.textContent = `${pairs.length} ${pairs.length === 1 ? "token" : "tokens"}`;
	holder.append(count);
}
