"""The spoken version of a reply: what the teacher says aloud, sentence by sentence.

The teacher marks it in its reply between `<spoken>` and `</spoken>`, and only what is marked is
spoken: a reply with no mark is not spoken at all, and a block left open runs to the end of the
reply. A mark inside code is not a mark. What is spoken is plain text: code, tables, images,
links' addresses, HTML and the marks of Markdown are left out, and the text of links is kept.
"""

import re
import unicodedata

_SPOKEN = re.compile(r"<spoken>(.*?)(?:</spoken>|\Z)", re.DOTALL | re.IGNORECASE)
# A fence closes with at least as many of the same mark as opened it.
_FENCE = re.compile(r"^[ \t]*(([`~])\2{2,}).*?(?:^[ \t]*\1\2*[ \t]*$|\Z)", re.DOTALL | re.MULTILINE)
_TABLE_RULE = re.compile(r"^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$")
_COMMENT = re.compile(r"<!--.*?(?:-->|\Z)", re.DOTALL)
_TAG = re.compile(r"</?[A-Za-z][^>]*>")
_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)|!\[[^\]]*\]\[[^\]]*\]")
_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)|\[([^\]]+)\]\[[^\]]*\]")
_LINK_DEFINITION = re.compile(r"^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$", re.MULTILINE)
_URL = re.compile(r"<?\b(?:https?://|www\.)\S+?>?(?=[\s)]|[.,;:!?](?:\s|$)|$)")
_INLINE_CODE = re.compile(r"(`+)(.+?)\1")
_RULE = re.compile(r"^[ \t]*(?:[-*_][ \t]*){3,}$", re.MULTILINE)
_BLOCK_MARK = re.compile(r"^[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)?")
_HEADING = re.compile(r"^[ \t]*(?:>[ \t]*)*#{1,6}[ \t]")
_ITEM = re.compile(r"^[ \t]*(?:>[ \t]*)*(?:[-*+]|\d+[.)])[ \t]")
_EMPHASIS = re.compile(r"(\*\*|__|\*|~~)(?=\S)(.+?)(?<=\S)\1|\b_(?=\S)(.+?)(?<=\S)_\b")
_SENTENCE_END = re.compile(r"(?:(?<=[.!?…])|(?<=[.!?…][\"'”»)\]]))\s+")


def _without_tables(text: str) -> str:
    """The text without its tables: a table is the line before a rule of dashes and pipes, the
    rule, and the lines with a pipe that follow it."""
    lines = text.splitlines()
    kept: list[str] = []
    in_table = False
    for line in lines:
        if _TABLE_RULE.match(line):
            if kept and "|" in kept[-1]:
                _ = kept.pop()
            in_table = True
        elif in_table and "|" in line and line.strip() != "":
            pass
        else:
            in_table = False
            kept.append(line)
    return "\n".join(kept)


def _strip_inline(line: str) -> str:
    line = _IMAGE.sub("", line)
    line = _LINK.sub(lambda match: match.group(1) or match.group(2), line)
    line = _URL.sub("", line)
    line = _TAG.sub("", line)
    for _ in range(3):  # emphasis inside emphasis
        line = _EMPHASIS.sub(lambda match: match.group(2) or match.group(3), line)
    return "".join(
        " " if unicodedata.category(char) in {"So", "Cs", "Co"} else char for char in line
    )


def _paragraphs(text: str) -> list[str]:
    """The text cut where Markdown starts a new block: blank lines, headings and list items."""
    paragraphs: list[list[str]] = [[]]
    for line in text.splitlines():
        heading = _HEADING.match(line) is not None
        if line.strip() == "" or heading or _ITEM.match(line) is not None:
            paragraphs.append([])
        paragraphs[-1].append(_strip_inline(_BLOCK_MARK.sub("", line)))
        if heading:
            paragraphs.append([])
    return [" ".join(lines) for lines in paragraphs]


def _clean(sentence: str) -> str:
    sentence = re.sub(r"\s+", " ", sentence).strip()
    sentence = re.sub(r"\s+([,.;:!?…])", r"\1", sentence)
    # What is left where a link's address was taken out: "see:." or "see ,".
    return re.sub(r"[,;:]+(?=[.!?…])", "", sentence)


def spoken_version(reply: str) -> list[str]:
    """The sentences to say aloud from a reply of the teacher's, in order."""
    # Code goes first, so that a mark written inside code is not taken for one.
    text = _FENCE.sub("\n\n", reply)
    text = _INLINE_CODE.sub("", text)
    text = "\n\n".join(_SPOKEN.findall(text))
    text = _COMMENT.sub("", text)
    text = _without_tables(text)
    text = _LINK_DEFINITION.sub("", text)
    text = _RULE.sub("\n\n", text)
    sentences: list[str] = []
    for paragraph in _paragraphs(text):
        for sentence in _SENTENCE_END.split(paragraph):
            cleaned = _clean(sentence)
            if any(char.isalnum() for char in cleaned):
                sentences.append(cleaned)
    return sentences
