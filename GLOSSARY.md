# Feris-Teach

A teaching agent built for its owner alone: it teaches any subject by talking with the student, in text or voice, while it builds and edits a web classroom holding the class material.

## People and agents

**Student**:
The person who learns: the owner of Feris-Teach, on their own machine.
_Avoid_: User, learner

**Profile**:
What the teacher knows about the student: what to call them, their language, background, interests and how they like to learn.
_Avoid_: Account, settings

**Teacher**:
The agent that gives the class: it talks, asks, listens and points. It answers fast and never writes long material.
_Avoid_: Tutor, assistant

**Persona**:
The personality the teacher takes on. It shows in how the teacher acts, never in the teacher describing itself. Its voice and its avatar are how it is shown, and each can be replaced without changing the persona.
_Avoid_: Character

**Voice**:
How the teacher sounds when a reply is spoken. The student can replace it with another one.
_Avoid_: Speaker, TTS

**Default voice**:
The voice the teacher uses unless the student picks another: a voice the owner trained in the studio. It sounds the same on every sentence.
_Avoid_: Official voice

**Avatar**:
The image that shows the persona.

**Feris**:
The persona the teacher takes on.

**Preparer**:
The agent that builds teaching material at the teacher's request, in the background and with more effort.
_Avoid_: Generator, author, content agent

**Advisor**:
The agent the teacher consults when it cannot explain something; it answers briefly and the teacher explains it in the persona's own words.
_Avoid_: Expert, consultant

## Material

**Book**:
All the material for one subject, organised as a book: index, chapters, lessons, glossary and reference.
_Avoid_: Subject, topic, course, workspace

**Chapter**:
A part of a book that groups related lessons.

**Lesson**:
A classroom page that teaches one concrete idea of the book.
_Avoid_: Class (the class is the session, not the page)

**Index**:
The map of a book: which chapters and lessons exist and where each one is. It is the only part of the book the teacher always loads.
_Avoid_: Table of contents, syllabus

**Source**:
A document the student brings (a PDF book, an image, text, a web page) from which the preparer draws material.
_Avoid_: Reference (that is the book's cheat sheet), resource

**Inbox**:
Where the student drops unsorted sources; the preparer assigns them to a book later.
_Avoid_: Tray, uploads

**Source card**:
The summary of a source plus the map of which parts serve which chapter or lesson. It is consulted instead of the whole source.
_Avoid_: Summary, source index

**Whiteboard**:
The set of visual tools the preparer uses for material: charts, diagrams, functions, simulations, images… It grows with what the books need.
_Avoid_: Widgets, visual components

## The class

**Class**:
A teaching session between the teacher and the student about a book, in text, voice or both.
_Avoid_: Study session, chat

**Welcome**:
The first class, where the persona introduces itself and builds the student's profile. Every question can be skipped.
_Avoid_: Onboarding, init, setup

**Classroom**:
The local web page where the visual part of the class happens: it shows the lessons, and the teacher sees it and points at it.
_Avoid_: Web app, frontend, platform

**View**:
The part of the lesson the student has on screen right now. The teacher knows it without being told.
_Avoid_: Position, scroll, focus

**Point at**:
What the teacher does to direct the student's attention to one spot in the classroom: highlight it or take them to it.
_Avoid_: Mark, select

**Spoken version**:
What the teacher says aloud from a reply: the explanation and the question, without code, tables or links.
_Avoid_: Voice summary, transcript

**Tone**:
The intonation the teacher chooses for a stretch of the spoken version (cheerful, calm, whispered…). The voice decides which tones exist; with none chosen, the stretch sounds neutral.
_Avoid_: Emotion, mood, style

**Interruption**:
The student cutting the teacher off mid-reply. The teacher learns which sentence it was on and what went unheard.
_Avoid_: Barge-in, cancel

## Building Feris-Teach

**Part**:
A piece of Feris-Teach that can be built, tried, replaced or removed on its own: the toolbelt, the classroom, the voice service, the lab.
_Avoid_: Module, package, component

**Lab**:
The place where one part of Feris-Teach is tried in isolation, by an agent or by a human, without giving a whole class.
_Avoid_: Playground, sandbox, test bench

**Studio**:
The part where the owner trains a voice from a recipe. It is never used during a class.
_Avoid_: Trainer, pipeline

**Recipe**:
The samples and training settings the studio trains one voice from. The student can keep several, to try different voices.
_Avoid_: Profile (the profile is what the teacher knows about the student), dataset

**Scenario**:
A prepared situation loaded into the lab: a book, a view, a reply to speak, a persona prompt… plus what to check or rate.
_Avoid_: Fixture, test case, demo
