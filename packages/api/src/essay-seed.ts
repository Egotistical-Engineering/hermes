export const ESSAY_TITLE = 'What Does a Tool Owe You?';

export const ESSAY_OUTLINE = `# What Does a Tool Owe You?

## The Question
## AI's Two Paths
## Dignified Technology
## Dignity Metrics
## Values-as-Spec
## The Durable Case
## The Answer`;

export const ESSAY_MARKDOWN = `There\u2019s a question I keep coming back to when I\u2019m building something: what does this tool owe the person using it?

Not \u2018what does it do for them\u2019 \u2014 that\u2019s a feature question. And not \u2018does it make them more productive\u2019 \u2014 that\u2019s an efficiency question. I mean something harder than both of those: what does it owe them in the human sense? What is it taking from them in exchange for what it\u2019s giving? And is that trade one they would have chosen if anyone had asked?

The Shirky Principle will say that institutions will try to preserve the problem to which they are the solution. I wonder if it goes the same for our tools. And if we as humans have given (or even been asked for) consent to the tradeoffs that the discernment (and hence energy) the use of these tools requires.

I\u2019ve been building creative tools at a media company for the last year, and this question follows me into every product decision I make. Tools can deepen the user\u2019s relationship to their own work by making it better, or it can assert itself at the expense of its original purpose. And most of the people building AI tools have not thought carefully about what values are embedded in their products.

---

AI is working alongside us. The marketing from AI labs is not fluff. AI is not just showing up in the pervasive recommendation systems that we collectively describe as \u201cthe algorithm\u201d anymore. AI lives in enterprise processes, involved with the actual work production that was once handled exclusively by humans. The writing, the design, the coding, the thinking. And the fundamental capability it introduces is the ability to remove the human from any of those processes. Entirely. You can choose to take the writer out of the writing. The designer out of the design. The thinker out of the thinking.

AI for work can be applied in opposite ways when it comes to preserving human dignity; the technology is the same either way.

One way: you use AI to generate the output. The user types a prompt, the tool produces a draft, and the human becomes an editor of machine output rather than an author. Fast, efficient. The relationship between the person and their ideas is replaced by a relationship between the person and a tool\u2019s output. They didn\u2019t shape the work. They accepted it as finished.

The other way: you use AI to deepen the process. The tool asks questions that draw out what you actually think. It surfaces three angles you hadn\u2019t considered. It challenges the weakest assumption in the draft. It finds connections to other work you\u2019ve done and forgotten about. It helps you go further into the idea than you could have gone alone \u2014 and then the work you produce feels genuinely yours, more completely yours than it would have been without the tool, because it directly conspired in helping you go deeper. Just like a true collaborator would.

Both approaches apply the same underlying technology. The difference is entirely in what the people who built it decided the tool was for. Whether it was designed to produce output or to deepen thinking. Whether it treats human involvement as the bottleneck, or as the whole point. And what is the price to be paid for the fragility of borrowed intelligence.

There\u2019s another dimension here that I think is undernamed. Agency \u2014 in the way we usually talk about it \u2014 is your capacity to act. But there\u2019s something prior to that: your capacity to govern what reaches you. I think of this as input agency. Most tools we build today have been designed to maximize other people\u2019s access to our attention while giving us almost no sovereignty over what enters our field. The notification you didn\u2019t ask for. The algorithmic insertion you never consented to. The default is open; opting out is the labor. And that labor \u2014 the constant discernment required just to maintain your own attentional sovereignty \u2014 is itself an unconsented cost. A tool that erodes your input agency is already failing the dignity test before you\u2019ve even started using it for its stated purpose.

---

I want to give a name to the design philosophy that chooses the second path, because naming things is how we start being able to choose them deliberately.

I\u2019ll call it Dignified Technology: tools that protect and elevate the creative, expressive, and irreplaceable dimensions of human work. Tools that treat those dimensions \u2014 creativity, self-expression, authorship, discernment, thinking, attention \u2014 as devotional practices rather than inefficiencies to be optimized away.

That phrase, \u2018devotional practices,\u2019 is doing some work here and I want to explain it. When I say that creativity is a devotional practice, I don\u2019t mean it in a religious sense. I mean that these are things we do that have intrinsic value \u2014 value in the doing, not just in the output. The act of writing an essay teaches you what you think. The act of designing something teaches you what you care about. The act of working through a problem teaches you how to think. These processes can\u2019t be outsourced without losing what made them valuable. You can\u2019t delegate your thinking to a tool and still expect to truly understand something. The transformation is in the process, not the outcome.

Technology that catalyzes these devotions makes them more valuable. Technology that replaces them makes them irrelevant, destroys the dignity that underpins doing truly amazing work. That\u2019s the choice that\u2019s being made in every AI tool being built right now, and almost nobody applying the technology is making it consciously as part of their design process.

---

The practical version of this is simpler than it sounds.

I think about it as a product requirement: does this tool expand the user\u2019s creative range, or flatten it? Does it amplify their voice, or replace it? Does the user feel genuine ownership of what they created? Does the tool make them a better judge of quality over time, or a passive acceptor of generated output? Did the tool help them go deeper into an idea than they could alone \u2014 more connections made, more assumptions challenged, more concepts explored?

These are not soft questions. You can measure each of them. I call them dignity metrics, and they\u2019re as real and trackable as any product metric \u2014 we\u2019ve just never built the acceptance criteria and instrumentation for them because we\u2019ve never decided that they matter.

Take authorship, for example, could you measure whether the user would sign their name on the work output without hesitation? Or conceptual range: how many more ideas did they explore because of this tool? Maybe process involvement: did the tool ask them questions, or just produce output? Depth of exploration: did they reach an insight they wouldn\u2019t have found alone?

Speed and efficiency still matter. But as one metric category among others that we develop to meet the reality of contemporary technologies, like superhuman-level AI.

---

The way I operationalize this when developing AI tools is simple. I add a value system section to every product requirements document. The PRD defines three things: what values the product is committed to protecting; how the product involves the user in its processes; and \u2014 crucially \u2014 what the product explicitly will not automate or replace. What it does, won\u2019t do, and can\u2019t do.

That last one is the hardest and most important. It requires explicitly defining which parts of the work are dignified, and therefore worth involving a human collaborator. It requires saying: this is where the tool stops and the person starts. Most product teams never make that choice explicitly. They let the algorithm\u2019s logic make it for them, which always answers the same way: automate everything you can.

Values-as-Spec is the practice of making that choice deliberately \u2014 embedding it in the requirements, making it as concrete and measurable as any feature specification.

---

I\u2019ve been working in this way for the last year, and I\u2019m increasingly convinced it\u2019s not just the right approach \u2014 it\u2019s the durable one. There\u2019s a business case here that doesn\u2019t require any appeal to ethics.

Tools that make workers feel replaced breed animosity. Loyalty is fragile \u2014 it lasts exactly as long as someone feels valued, and therefore respected. Tools that make users feel more capable, more creative, more themselves produce loyalty, which compounds. Strong employee retention is downstream of whether the work was rewarding, which starts with tools that encourage meaningful ownership, quality, and impact.

There\u2019s a broader movement forming around adjacent ideas \u2014 the Resonant Computing Manifesto, signed by people like Tim O\u2019Reilly and Kevin Kelly, applies Christopher Alexander\u2019s architectural theory to argue that software can either enliven or deaden us. The movement\u2019s diagnosis is sharp. What I\u2019m adding is the implementation layer: the values-as-spec template, the dignity metrics, the specific product decisions that turn these principles into something you can integrate into your work today.

I\u2019ve signed it and I urge you to also sign it. They\u2019re also crowdsourcing theses for what it means to have dignified-resonant-computing.

---

Let me come back to the question I started with.

What does a tool owe you? I think the answer is this: a tool owes you your own capability back, amplified. It owes you a relationship with your work that is deeper and more yours for having used it. It owes you the dignity of being the one who did the thinking, even when it helped you think.

That\u2019s a design choice, and it\u2019s available to anyone building right now. It requires no special technology, no particular budget, no philosophical training. It just requires deciding \u2014 explicitly, in the product requirements, with metrics attached \u2014 that a person\u2019s relationship to their own work is the thing worth protecting.

Every founder, product manager, designer, and developer makes this choice with every feature they ship. Often they decide unconsciously, by inheriting the default logic of whatever metric is rewarded. But metrics must be designed consciously, because they will be optimized. They can be embedded in requirements. They can be measured.

Start there. Ask what the tool owes the person using it. Write down the answer. Build toward it.

The future of technology doesn\u2019t have to be a race to automate away everything that makes work meaningful \u2014 but only if we choose, deliberately, to build something that makes us more alive, will we live in a world of dignified technology.

> \u201cWith few ambitions, most people allowed efficient machines to perform everyday tasks for them. Gradually, humans ceased to think, or dream... or truly live.\u201d
> \u2014 Brian Herbert, *The Butlerian Jihad*

Thank you to my collaborator [Aishwarya Khanduja](https://www.aishwaryadoingthings.com/) for her notes on this post.`;
