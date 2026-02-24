export const WELCOME_TITLE = 'Welcome to Hermes';

export const WELCOME_PAGES: Record<string, string> = {
  coral: `# The Editor

Hermes is a writing tool that helps you think deeper — without doing the writing for you.

You're looking at a **rich markdown editor**. Everything you type is saved automatically. Try out a few things:

- **Bold** with \`Cmd+B\`, *italic* with \`Cmd+I\`
- Insert a [link](https://example.com) with \`Cmd+K\`
- Type \`# \` at the start of a line for a heading
- Use \`> \` for blockquotes, \`- \` for bullet lists

## Pages

See the colored tabs above? Each project has five pages — use them however you like. Separate chapters, different angles on the same idea, or notes alongside your draft.

Click a tab to switch. Your content is preserved across all of them.

## What makes this different

Most AI writing tools generate text for you. Hermes takes the opposite approach: it helps you develop *your own* ideas through structured thinking, honest feedback, and careful questions. The words are always yours.`,

  amber: `# The Assistant

See the collapsible icon at the bottom of the page? That's your AI writing assistant. Open it to start a conversation — it reads what you've written and responds with questions, suggestions, and observations, but it never writes *for* you.

## Highlights

When you ask the assistant for feedback or its opinion on your writing, it can highlight specific passages directly in your editor. Highlights only appear when you prompt them — the assistant won't mark up your text unprompted. You can:

- **Hover** a highlight to see the comment
- **Accept** a suggested edit with one click
- **Dismiss** highlights you've addressed
- **Reply** to continue the conversation about that passage

For example, it might ask a probing question, offer a suggestion, propose a specific edit, note a voice inconsistency, identify a weakness, request supporting evidence, flag unnecessary wordiness, or raise a fact check.

## Philosophy

Hermes believes the act of writing is where thinking happens. If an AI writes your draft, you skip the part that matters most — the struggle to find what you actually mean.

Instead, the assistant helps you go deeper: challenging weak arguments, asking what you really intended, and surfacing connections you might have missed. It's a collaborator, not a ghostwriter.

*Start free with 10 messages a day. [Sign up](https://dearhermes.com/signup) to get started, or [become a Patron](https://dearhermes.com/upgrade) to support development and unlock more.*`,

  sage: `# About Hermes

Hermes is built on a design philosophy called **[Dignified Technology](http://dignifiedtechnology.org/)** — the idea that tools should protect and elevate the creative, expressive, and irreplaceable dimensions of human work.

Every AI product makes a choice: use the technology to *replace* the human in the process, or use it to help them go *deeper*. Hermes chooses depth. The writing is yours. The thinking is yours. The tool just helps you do both better.

You can read the full essay — *What Does a Tool Owe You?* — in the project switcher. It ships with every new account.

## Open source

Hermes is open source. You can read the code, suggest improvements, or fork it for your own use.

[GitHub repository](https://github.com/xaelophone/hermes)`,

  sky: '',
  lavender: '',
};

export const WELCOME_HIGHLIGHTS = [
  { id: 'welcome-question', matchText: 'a probing question', type: 'question', comment: 'What exactly do you mean by this? Could you unpack the idea further?' },
  { id: 'welcome-suggestion', matchText: 'a suggestion', type: 'suggestion', comment: 'Consider restructuring this section to lead with your strongest point.' },
  { id: 'welcome-edit', matchText: 'a specific edit', type: 'edit', comment: 'This could be tighter.', suggestedEdit: 'a precise edit' },
  { id: 'welcome-voice', matchText: 'a voice inconsistency', type: 'voice', comment: 'The tone shifts here — more formal than the rest of the piece.' },
  { id: 'welcome-weakness', matchText: 'a weakness', type: 'weakness', comment: 'This claim needs stronger support to be convincing.' },
  { id: 'welcome-evidence', matchText: 'supporting evidence', type: 'evidence', comment: 'Can you point to a specific example or source?' },
  { id: 'welcome-wordiness', matchText: 'unnecessary wordiness', type: 'wordiness', comment: 'This phrase could be cut without losing meaning.' },
  { id: 'welcome-factcheck', matchText: 'a fact check', type: 'factcheck', comment: 'Worth double-checking — is this accurate?' },
];
