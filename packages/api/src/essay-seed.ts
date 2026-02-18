export const ESSAY_TITLE = 'What Does a Tool Owe You?';

export const ESSAY_SUBTITLE = 'On dignified technology, AI, and the design choices that determine whether technology makes us more or less human';

export const ESSAY_PAGES: Record<string, string> = {
  coral: `There's a question I keep coming back to when I'm building something: what does this tool owe the person using it?

Not 'what does it do for them' — that's a feature question. And not 'does it make them more productive' — that's an efficiency question. I mean something harder than both of those: what does it owe them in the human sense? What is it taking from them in exchange for what it's giving? And is that trade one they would have chosen if anyone had asked?

The Shirky Principle will say that institutions will try to preserve the problem to which they are the solution. I wonder if it goes the same for our tools. And if we as humans have given (or even been asked for) consent to the tradeoffs that the discernment (and hence energy) the use of these tools requires.

I've been building creative tools at a media company for the last year, and this question follows me into every product decision I make. Tools can deepen the user's relationship to their own work by making it better, or it can assert itself at the expense of its original purpose. And most of the people building AI tools have not thought carefully about what values are embedded in their products.

---

AI is working alongside us. The marketing from AI labs is not fluff. AI is not just showing up in the pervasive recommendation systems that we collectively describe as \u201cthe algorithm\u201d anymore. AI lives in enterprise processes, involved with the actual work production that was once handled exclusively by humans. The writing, the design, the coding, the thinking. And the fundamental capability it introduces is the ability to remove the human from any of those processes. Entirely. You can choose to take the writer out of the writing. The designer out of the design. The thinker out of the thinking.

AI for work can be applied in opposite ways when it comes to preserving human dignity; the technology is the same either way.

One way: you use AI to generate the output. The user types a prompt, the tool produces a draft, and the human becomes an editor of machine output rather than an author. Fast, efficient. The relationship between the person and their ideas is replaced by a relationship between the person and a tool's output. They didn't shape the work. They accepted it as finished.

The other way: you use AI to deepen the process. The tool asks questions that draw out what you actually think. It surfaces three angles you hadn't considered. It challenges the weakest assumption in the draft. It finds connections to other work you've done and forgotten about. It helps you go further into the idea than you could have gone alone — and then the work you produce feels genuinely yours, more completely yours than it would have been without the tool, because it directly conspired in helping you go deeper. Just like a true collaborator would.

Both approaches apply the same underlying technology. The difference is entirely in what the people who built it decided the tool was for. Whether it was designed to produce output or to deepen thinking. Whether it treats human involvement as the bottleneck, or as the whole point. And what is the price to be paid for [the fragility of borrowed intelligence](https://www.aishwaryadoingthings.com/the-fragility-of-borrowed-intelligence).

There's another dimension here that I think is undernamed. Agency — in the way we usually talk about it — is your capacity to act. But there's something prior to that: your capacity to govern what reaches you. I think of this as **input agency**. Most tools we build today have been designed to maximize other people's access to our attention while giving us almost no sovereignty over what enters our field. The notification you didn't ask for. The algorithmic insertion you never consented to. The default is open; opting out is the labor. And that labor — the constant discernment required just to maintain your own attentional sovereignty — is itself an unconsented cost. A tool that erodes your input agency is already failing the dignity test before you've even started using it for its stated purpose.

---

I want to give a name to the design philosophy that chooses the second path, because naming things is how we start being able to choose them deliberately.

I'll call it **[Dignified Technology](https://github.com/xaelophone/dignified-technology)**: tools that protect and elevate the creative, expressive, and irreplaceable dimensions of human work. Tools that treat those dimensions — creativity, self-expression, authorship, discernment, thinking, attention — as devotional practices rather than inefficiencies to be optimized away.

That phrase, 'devotional practices,' is doing some work here and I want to explain it. When I say that creativity is a devotional practice, I don't mean it in a religious sense. I mean that these are things we do that have intrinsic value — value in the doing, not just in the output. The act of writing an essay teaches you what you think. The act of designing something teaches you what you care about. The act of working through a problem teaches you how to think. These processes can't be outsourced without losing what made them valuable. You can't delegate your thinking to a tool and still expect to truly understand something. The transformation is in the process, not the outcome.

Technology that catalyzes these devotions makes them more valuable. Technology that replaces them makes them irrelevant, destroys the dignity that underpins doing truly amazing work. That's the choice that's being made in every AI tool being built right now, and almost nobody applying the technology is making it consciously as part of their design process.

---

The practical version of this is simpler than it sounds.

I think about it as a product requirement: does this tool expand the user's creative range, or flatten it? Does it amplify their voice, or replace it? Does the user feel genuine ownership of what they created? Does the tool make them a better judge of quality over time, or a passive acceptor of generated output? Did the tool help them go deeper into an idea than they could alone — more connections made, more assumptions challenged, more concepts explored?

These are not soft questions. You can measure each of them. I call them dignity metrics, and they're as real and trackable as any product metric — we've just never built the acceptance criteria and instrumentation for them because we've never decided that they matter.

Take authorship, for example, could you measure whether the user would sign their name on the work output without hesitation? Or conceptual range: how many more ideas did they explore because of this tool? Maybe process involvement: did the tool ask them questions, or just produce output? Depth of exploration: did they reach an insight they wouldn't have found alone?

Speed and efficiency still matter. But as one metric category among others that we develop to meet the reality of contemporary technologies, like superhuman-level AI.

---

The way I operationalize this when developing AI tools is simple. I add a value system section to every product requirements document. The PRD defines three things: what values the product is committed to protecting; how the product involves the user in its processes; and — crucially — what the product explicitly will not automate or replace. What it does, won't do, and can't do.

That last one is the hardest and most important. It requires explicitly defining which parts of the work are dignified, and therefore worth involving a human collaborator. It requires saying: this is where the tool stops and the person starts. Most product teams never make that choice explicitly. They let the algorithm's logic make it for them, which always answers the same way: automate everything you can.

Values-as-Spec is the practice of making that choice deliberately — embedding it in the requirements, making it as concrete and measurable as any feature specification.

---

I've been working in this way for the last year, and I'm increasingly convinced it's not just the right approach — it's the durable one. There's a business case here that doesn't require any appeal to ethics.

Tools that make workers feel replaced breed animosity. Loyalty is fragile — it lasts exactly as long as someone feels valued, and therefore respected. Tools that make users feel more capable, more creative, more themselves produce loyalty, which compounds. Strong employee retention is downstream of whether the work was rewarding, which starts with tools that encourage meaningful ownership, quality, and impact.

There's a broader movement forming around adjacent ideas — [the Resonant Computing Manifesto](https://resonantcomputing.org/), signed by people like Tim O'Reilly and Kevin Kelly, applies Christopher Alexander's architectural theory to argue that software can either enliven or deaden us. The movement's diagnosis is sharp. What I'm adding is the implementation layer: the values-as-spec template, the dignity metrics, the specific product decisions that turn these principles into something you can integrate into your work today.

I've signed it and I urge you to also sign it. They're also crowdsourcing theses for what it means to have dignified-resonant-computing.

---

Let me come back to the question I started with.

What does a tool owe you? I think the answer is this: a tool owes you your own capability back, amplified. It owes you a relationship with your work that is deeper and more yours for having used it. It owes you the dignity of being the one who did the thinking, even when it helped you think.

That's a design choice, and it's available to anyone building right now. It requires no special technology, no particular budget, no philosophical training. It just requires deciding — explicitly, in the product requirements, with metrics attached — that a person's relationship to their own work is the thing worth protecting.

Every founder, product manager, designer, and developer makes this choice with every feature they ship. Often they decide unconsciously, by inheriting the default logic of whatever metric is rewarded. But metrics must be designed consciously, because they will be optimized. They can be embedded in requirements. They can be measured.

Start there. Ask what the tool owes the person using it. Write down the answer. Build toward it.

The future of technology doesn't have to be a race to automate away everything that makes work meaningful — but only if we choose, deliberately, to build something that makes us more alive, will we live in a world of dignified technology.

> \u201cWith few ambitions, most people allowed efficient machines to perform everyday tasks for them. Gradually, humans ceased to think, or dream... or truly live.\u201d
> — **Brian Herbert**, *The Butlerian Jihad*

Thank you to my collaborator [Aishwarya Khanduja](https://www.aishwaryadoingthings.com/) for her notes on this post.`,

  amber: `# Dignified Technology Audit

> "A tool owes you your own capability back, amplified."

**Date**: 2026-02-18

**Assessed by**: Claude (with interview input from Sean Thielen-Esparza)

**Overall Dignity Grade**: A

---

## Principle Scores

- **Authorship Preservation — A**: AI never writes prose — it reads, questions, and highlights. The user is unambiguously the author.
- **Creative Range — B**: 8 highlight types surface multiple angles; chat allows divergent exploration. But no structured divergent phase.
- **Voice Amplification — B**: Voice highlights flag style deviations using prior essays. New users have no voice profile yet — by design.
- **Process Involvement — A**: Multi-step loop: write, chat, receive highlights, accept/dismiss/reply, refine. User decides at every point.
- **Depth of Exploration — B**: Weakness, evidence, and factcheck highlights challenge arguments. Reactive by design — responds to writing, doesn't precede it.
- **Input Agency — A**: All AI features are opt-in. No auto-complete, no unsolicited suggestions. Chat minimized by default.

---

## Detailed Findings

### Authorship Preservation — A

**What we found**: Hermes draws a hard line: AI provides feedback, never content. The user writes in a TipTap editor; AI reads that writing and responds with highlights — questions, suggestions, weaknesses, factchecks. Even the edit and wordiness highlights, which offer replacement text, require explicit user acceptance before anything changes. The system prompt describes Hermes as "a thoughtful writing assistant...the kind of reader every writer wishes they had." The CLAUDE.md reinforces this: "structures your thinking without doing the writing for you." This is authorship preservation by architecture, not just policy.

**Recommendation**: None needed. This is exemplary. Consider documenting this design choice publicly as a reference for other tools.

### Creative Range — B

**What we found**: Hermes surfaces creative range through 8 highlight types (question, suggestion, weakness, evidence, voice, factcheck, edit, wordiness) that each push the user to consider a different angle on their writing. The Are.na integration connects external research into the writing flow. However, there is no structured "explore 3 alternatives" feature or explicit divergent phase in the workflow. The builder confirmed this is intentional — users explore through conversation in the chat panel, not through structured divergent features.

**Recommendation**: Consider adding a lightweight "what angles haven't I explored?" prompt the user can invoke, which surfaces the highlight types most absent from the current piece (e.g., "you haven't challenged any of your claims — want factcheck highlights?").

### Voice Amplification — B

**What we found**: Hermes has a dedicated "voice" highlight type that flags when the user's current writing deviates from their established style, using prior published essays as a reference corpus. This is a genuine voice-learning mechanism — it adapts to the individual user rather than imposing a default tone. The limitation: new users with no prior essays get no voice adaptation. The builder confirmed this is a known, accepted limitation — voice builds over time as the user writes more.

**Recommendation**: For new users, consider offering a brief voice intake (e.g., "paste a paragraph you're proud of" or "describe your writing style in 3 words") to bootstrap the voice profile from the first session.

### Process Involvement — A

**What we found**: The Hermes workflow is inherently multi-step and user-driven. The user writes, then optionally opens the chat to request feedback. AI responds with highlights, each of which the user can accept, dismiss, or reply to for further discussion. Question highlights explicitly ask the user to think deeper. The chat itself is conversational and iterative — not a one-shot oracle. There is no "generate my essay" button, no one-click path from blank page to finished piece. The builder confirmed the user is in the loop for all content decisions, with only infrastructure (essay loading, context assembly) happening automatically.

**Recommendation**: None needed. The multi-step, decision-rich workflow is a model of process involvement.

### Depth of Exploration — B

**What we found**: Hermes challenges the user's thinking through weakness highlights (flagging the weakest arguments), evidence highlights (identifying where data would strengthen claims), and factcheck highlights (questioning specific assertions). The Are.na integration surfaces external connections that can deepen research. However, the tool is reactive by design — it responds to existing text rather than proactively pushing deeper thinking before the user starts writing. The builder confirmed this is intentional: the tool responds to the user's writing, not the other way around.

**Recommendation**: Consider an optional pre-writing mode where the user can describe their thesis in one sentence and receive 3 questions designed to stress-test it before they begin drafting. This preserves the reactive default while offering depth-first users a path to challenge their assumptions early.

### Input Agency — A

**What we found**: Every AI feature in Hermes is opt-in. The floating chat is minimized by default. Highlights only appear after the user explicitly requests them by sending a message. There is no auto-complete, no inline suggestion, no algorithmic content insertion. The only unsolicited element is a signup toast for unauthenticated users, which is dismissible and persisted to localStorage so it only appears once. The builder explicitly identified "unsolicited suggestions" as something Hermes refuses to automate. This is attentional sovereignty by architecture.

**Recommendation**: None needed. This is exemplary. The opt-in model is the clearest expression of input agency in any AI writing tool we've assessed.

---

## Values-as-Spec Assessment

**Values protected**:

- *Authorship above all* — AI never generates prose. This shaped the entire highlight-based architecture.
- *User sovereignty* — The user controls when AI participates. No unsolicited suggestions, no auto-complete.
- *Thinking over output* — The tool exists to deepen thinking, not produce content. Speed and volume are explicitly deprioritized.

**User involvement**: The user is mostly in the loop. Every AI action requires user initiation (open chat, send message, request highlights) and every AI output requires user decision (accept/dismiss/reply). Background processes like essay loading and context assembly happen automatically, but these are infrastructure, not content decisions.

**Automation boundaries**: Hermes explicitly refuses to write prose. It provides feedback, questions, highlights, and conversational assistance — but the words on the page are always the user's.

**Gap**: Publishing decisions and unsolicited suggestions were identified as automation boundaries in the interview but are not codified as design principles in product documentation. Consider adding a "What Hermes Won't Do" section to the product's public-facing materials.

---

## Top 3 Recommendations

1. **Bootstrap voice for new users**: Add a lightweight voice intake (paste a paragraph, describe your style) so voice amplification works from the first session, not just after multiple essays.
2. **Optional pre-writing depth mode**: Offer a "stress-test my thesis" feature where users can describe their argument in one sentence and receive probing questions before drafting — preserving the reactive default while giving depth-first users an earlier entry point.
3. **Document automation boundaries publicly**: Codify "What Hermes Won't Do" (write prose, make publishing decisions, offer unsolicited suggestions) in product documentation so users understand the design contract.

---

*Evaluation based on the [Dignified Technology framework](https://github.com/xaelophone/dignified-technology).*`,

  sage: `# Getting Started With the Dignified Technology Rubric

The Dignified Technology rubric scores six principles of human dignity in technology, each graded A through F. You can use it two ways: as an automated Claude Code skill, or as a manual framework applied by hand.

### How the rubric works

Each principle asks a specific question about your product:

- **Authorship Preservation**: Would the user sign their name on the output without hesitation?
- **Creative Range**: Does the tool expand the user's creative range, or flatten it?
- **Voice Amplification**: Does it amplify the user's unique voice, or replace it with a default?
- **Process Involvement**: Is the user involved throughout, or just at the beginning and end?
- **Depth of Exploration**: Did the user reach an insight they wouldn't have found alone?
- **Input Agency**: Does the user control what reaches them, or does the tool decide?

Grades mean:

- **A** — Exemplary. This principle is a deliberate, visible commitment in the product's architecture.
- **B** — Strong. The intent is clear with minor gaps.
- **C** — Adequate. The principle is partially present, likely by accident rather than design.
- **D** — Weak. The product undermines this principle in notable ways.
- **F** — Absent. The product actively harms this dimension.

The overall Dignity Grade averages all six scores (A=4, B=3, C=2, D=1, F=0). An F on any single principle caps the overall grade at D — a product that completely fails one dimension of dignity cannot be considered dignified overall.

### How we used it on Hermes

The Hermes audit followed a three-phase process:

**1. Codebase diagnosis.** We read the source code — AI integration points, user-facing flows, system prompts, CLAUDE.md — and formed a preliminary grade for each principle based on what the code revealed. Three principles (Authorship Preservation, Process Involvement, Input Agency) were clear from code alone. Three had gaps that needed human input.

**2. Targeted interview.** For the three principles with gaps, we asked the builder one question each. Is the lack of structured divergent exploration intentional? Is the new-user voice limitation a known tradeoff? Is the reactive depth model by design? All three turned out to be intentional design choices, which confirmed the preliminary B grades rather than lowering them.

**3. Values-as-Spec assessment.** Three questions that are always asked, because they require human intent that code can't reveal: What values has the product committed to protecting? Where is the human in the loop? What does the product refuse to automate? The builder named three values (authorship, sovereignty, thinking over output) that directly shaped design decisions — this is Values-as-Spec working as intended.

The result: an overall A, with three principles earning A and three earning B. The B grades reflect intentional tradeoffs, not oversights.

### How to use it yourself

**With Claude Code** (automated):

Install the skill and run \`/dignified-technology\` in your project directory. The skill reads your codebase, asks targeted questions about gaps it can't resolve from code, conducts the Values-as-Spec assessment, and produces a scorecard.

\`\`\`
curl -sSL https://raw.githubusercontent.com/xaelophone/dignified-technology/main/install.sh | bash
\`\`\`

**Without Claude Code** (manual):

1. For each of the six principles, examine your product and assign a grade using the rubric definitions above. Look at your AI integration points, user-facing flows, and default behaviors. Grade what's built, not what's planned.
2. Ask yourself the three Values-as-Spec questions: What values has your product committed to protecting — values that have directly shaped a design decision? How does your product involve the user in its processes — where is the human in the loop, and where aren't they? What does your product explicitly refuse to automate — not what it can't do, but what it won't do?
3. If you can't answer any of those three questions with a specific example tied to a design decision, that's the most important finding of the audit.
4. Calculate the overall grade and identify your top three highest-impact improvements.

The rubric is intentionally strict: when evidence is ambiguous, lean toward the lower grade. It's better to challenge a product to improve than to give credit for intent without execution.

&nbsp;`,

  sky: '',

  lavender: '',
};
