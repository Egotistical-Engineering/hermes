export type WritingStatus =
  | 'interview'
  | 'draft'
  | 'rewriting'
  | 'feedback'
  | 'complete';

export interface WritingProject {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  status: WritingStatus;
  content: string;
  pages: Record<string, string>;
  highlights: Highlight[];
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  highlights?: Highlight[];
  timestamp: string;
}

export interface Highlight {
  id: string;
  type: 'question' | 'suggestion' | 'edit' | 'voice' | 'weakness' | 'evidence' | 'wordiness' | 'factcheck';
  matchText: string;
  comment: string;
  suggestedEdit?: string;
  dismissed?: boolean;
}
