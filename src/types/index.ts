export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
  status: 'loading' | 'success' | 'error';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  links?: string[];
  toolCalls?: ToolCall[];
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  documentContent: string;
  createdAt: number;
}
