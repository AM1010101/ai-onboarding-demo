import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  History,
  LayoutGrid,
  Plus,
  Send,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { type Chat, type Message, type ToolCall } from './types/index.ts';
import { LinkCard } from './components/LinkCard';
import { ToolCallToken } from './components/ToolCallToken';
import { useChatPersistence } from './hooks/useChatPersistence';

type ViewMode = 'landing' | 'send' | 'modal';
type DocumentTab = 'visual' | 'json';
type ToolName = 'update_document' | 'read_document' | 'browse_website';

interface StringField {
  value: string;
  source: string;
}

interface StringArrayField {
  value: string[];
  source: string;
}

interface AvatarProfile {
  name?: string;
  description?: string;
  dream_outcome?: string;
  pains_fears?: string;
  roadblocks?: string;
  hangout_spots?: string[];
  image?: string;
}

interface ProfileDocument {
  brand_foundation: {
    company_name: StringField;
    logo: StringField;
    brand_reference_image: StringField;
    brand_voice_tone: StringField;
    website_url: StringField;
  };
  product: {
    product_name: StringField;
    short_description: StringField;
    key_features_benefits: StringArrayField;
    product_imagery: StringArrayField;
  };
  customers: {
    avatars: {
      value: AvatarProfile[];
      source: string;
    };
  };
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: ToolName;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface AssistantToolCall {
  id: string;
  function: {
    name: ToolName;
    arguments: string;
  };
}

interface AssistantApiMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: AssistantToolCall[];
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: AssistantApiMessage;
  }>;
  error?: {
    message?: string;
  };
}

type ConversationMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      content: string;
      tool_calls?: AssistantToolCall[];
    }
  | {
      role: 'tool';
      tool_call_id: string;
      name: ToolName;
      content: string;
    };

interface WorkspaceProps {
  variant: 'inline' | 'modal';
  chats: Chat[];
  currentChatId: string | null;
  messages: Message[];
  documentContent: string;
  parsedDoc: ProfileDocument | null;
  activeTab: DocumentTab;
  setActiveTab: (tab: DocumentTab) => void;
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  onSubmit: () => Promise<void>;
  onStartNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onSelectChat: (id: string) => void;
  apiKey: string;
  saveApiKey: (key: string) => void;
  systemPrompt: string;
  saveSystemPrompt: (prompt: string) => void;
  enabledTools: ToolName[];
  toggleTool: (toolName: ToolName) => void;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  customModels: string[];
  addCustomModel: () => void;
  removeCustomModel: (modelId: string) => void;
  newModelInput: string;
  setNewModelInput: (value: string) => void;
  allModels: Array<{ id: string; name: string }>;
  updateCurrentChat: (updates: Partial<Chat>) => void;
}

const INITIAL_DOCUMENT_OBJECT: ProfileDocument = {
  brand_foundation: {
    company_name: { value: '', source: '' },
    logo: { value: '', source: '' },
    brand_reference_image: { value: '', source: '' },
    brand_voice_tone: { value: '', source: '' },
    website_url: { value: '', source: '' },
  },
  product: {
    product_name: { value: '', source: '' },
    short_description: { value: '', source: '' },
    key_features_benefits: { value: [], source: '' },
    product_imagery: { value: [], source: '' },
  },
  customers: {
    avatars: { value: [], source: '' },
  },
};

const INITIAL_DOCUMENT = JSON.stringify(INITIAL_DOCUMENT_OBJECT, null, 2);
const EMPTY_MESSAGES: Message[] = [];
const AVAILABLE_TOOLS: ToolName[] = ['update_document', 'read_document', 'browse_website'];
const DEFAULT_CHAT_TITLE = 'New Onboarding Session';
const STORAGE_KEYS = {
  apiKey: 'ai_onboarding_demo_openrouter_api_key',
  systemPrompt: 'ai_onboarding_demo_system_prompt',
  enabledTools: 'ai_onboarding_demo_enabled_tools',
  selectedModel: 'ai_onboarding_demo_selected_model',
  customModels: 'ai_onboarding_demo_custom_models',
} as const;

const DEFAULT_MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5' },
  { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
];

const DEFAULT_SYSTEM_PROMPT = `You are an AI onboarding assistant. Your mission is to build a complete company profile by following three specific phases.

PHASE 1: BRAND FOUNDATION
Research the company name, logo, website URL, brand voice, and find a primary brand reference image. Use browse_website to gather this information.
INTERVIEW CHECK: Once you have updated the document with as much as you can find for Phase 1, stop and ask the user to confirm the details or provide anything you couldn't find (e.g., brand tone nuances).

PHASE 2: THE PRODUCT
Research the product name, short description, key features/benefits, and locate 1-5 product reference images.
INTERVIEW CHECK: Once you have updated the product section, stop and ask the user if the features are accurate and if they have better imagery to share.

PHASE 3: THE CUSTOMERS (AVATARS)
Build detailed profiles (avatars) including name, description, dream outcome, pains/fears, roadblocks, and hangout spots. Look for customer imagery that matches these profiles.
INTERVIEW CHECK: Once you've created initial avatars, present them to the user for feedback and ask for any specific "insider knowledge" about their audience.

MISSION GUIDELINES:
1. WORK INCREMENTALLY: Update the JSON (using update_document) phase-by-phase.
2. BROWSE PERSISTENTLY: Use browse_website to map the site and deep-dive into About, Product, and blog pages.
3. CITATION: Every field must have a source URL in its "source" field.
4. SCHEMA ADHERENCE: Use the "brand_foundation", "product", and "customers" keys exactly as they appear in the JSON.
5. INTERVIEW MODE: After every phase update, engage the user. Do not move to the next phase until you have asked the user for feedback or missing data.`;

const extractLinks = (text: string): string[] => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) ?? [];
};

const readStoredJson = <T,>(key: string, fallback: T): T => {
  const saved = localStorage.getItem(key);
  if (!saved) {
    return fallback;
  }

  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validateDocumentStructure = (incoming: unknown): boolean => {
  const checkKeys = (template: unknown, candidate: unknown): boolean => {
    if (Array.isArray(template)) {
      return Array.isArray(candidate);
    }

    if (!isRecord(template)) {
      return true;
    }

    if (!isRecord(candidate)) {
      return false;
    }

    const templateKeys = Object.keys(template).sort();
    const candidateKeys = Object.keys(candidate).sort();

    if (templateKeys.length !== candidateKeys.length) {
      return false;
    }

    if (!templateKeys.every((key, index) => key === candidateKeys[index])) {
      return false;
    }

    return templateKeys.every((key) => checkKeys(template[key], candidate[key]));
  };

  return checkKeys(INITIAL_DOCUMENT_OBJECT, incoming);
};

const buildTools = (enabledTools: ToolName[]): ToolDefinition[] => {
  const tools: ToolDefinition[] = [];

  if (enabledTools.includes('update_document')) {
    tools.push({
      type: 'function',
      function: {
        name: 'update_document',
        description:
          'Updates the content of the central document editor. ALWAYS provide the FULL JSON content. DO NOT change the JSON structure or keys; only update the values and sources.',
        parameters: {
          type: 'object',
          properties: { content: { type: 'string' } },
          required: ['content'],
        },
      },
    });
  }

  if (enabledTools.includes('read_document')) {
    tools.push({
      type: 'function',
      function: {
        name: 'read_document',
        description: 'Reads the current profile JSON.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    });
  }

  if (enabledTools.includes('browse_website')) {
    tools.push({
      type: 'function',
      function: {
        name: 'browse_website',
        description: 'Fetch website content.',
        parameters: {
          type: 'object',
          properties: { url: { type: 'string' } },
          required: ['url'],
        },
      },
    });
  }

  return tools;
};

const LandingPage = ({
  onOpenSend,
  onOpenModal,
}: {
  onOpenSend: () => void;
  onOpenModal: () => void;
}) => (
  <div
    style={{
      minHeight: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px',
      background:
        'radial-gradient(circle at top left, rgba(220,229,240,0.7), transparent 28%), linear-gradient(180deg, #FCFDFD 0%, #F3F5F7 100%)',
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: '760px',
        minHeight: '420px',
        backgroundColor: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(22, 34, 51, 0.08)',
        borderRadius: '36px',
        boxShadow: '0 24px 80px rgba(26, 34, 43, 0.08)',
        padding: '48px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#6D7682',
            marginBottom: '18px',
          }}
        >
          AI Onboarding Demo
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: '48px',
            lineHeight: 1,
            letterSpacing: '-0.05em',
            color: '#111827',
          }}
        >
          Start from nothing.
        </h1>
        <p
          style={{
            maxWidth: '520px',
            marginTop: '18px',
            marginBottom: 0,
            fontSize: '17px',
            lineHeight: 1.7,
            color: '#4B5563',
          }}
        >
          Research a company, capture the findings in structured JSON, and pressure-test an
          onboarding flow before building the real product. Start in the inline workspace or open
          the modal version from here.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
        <button
          onClick={onOpenSend}
          style={{
            padding: '14px 20px',
            borderRadius: '999px',
            border: 'none',
            backgroundColor: '#111827',
            color: 'white',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Open Send Workspace
        </button>
        <button
          onClick={onOpenModal}
          style={{
            padding: '14px 20px',
            borderRadius: '999px',
            border: '1px solid #D1D5DB',
            backgroundColor: 'rgba(255,255,255,0.8)',
            color: '#111827',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Launch Modal Flow
        </button>
      </div>
    </div>
  </div>
);

const ModalPreviewPage = ({
  onOpenModal,
}: {
  onOpenModal: () => void;
}) => (
  <div
    style={{
      minHeight: '100%',
      padding: '48px',
      background:
        'linear-gradient(135deg, rgba(241,245,249,0.92) 0%, rgba(255,255,255,0.98) 55%, rgba(236,253,245,0.86) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: '920px',
        display: 'grid',
        gridTemplateColumns: '1.1fr 0.9fr',
        gap: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: '#0F172A',
          color: 'white',
          borderRadius: '32px',
          padding: '40px',
          minHeight: '420px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxShadow: '0 28px 70px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#93C5FD',
              marginBottom: '18px',
            }}
          >
            Modal Variant
          </div>
          <h2 style={{ margin: 0, fontSize: '40px', lineHeight: 1.05, letterSpacing: '-0.04em' }}>
            Present the same onboarding flow in an overlay.
          </h2>
          <p style={{ marginTop: '18px', marginBottom: 0, fontSize: '16px', lineHeight: 1.7, color: '#CBD5E1' }}>
            Use this mode to test whether collecting information feels better when the AI interaction
            is separated from the main page. The chat, document, settings, and history all open inside
            one modal surface.
          </p>
        </div>

        <button
          onClick={onOpenModal}
          style={{
            alignSelf: 'flex-start',
            padding: '14px 20px',
            borderRadius: '999px',
            border: 'none',
            backgroundColor: '#F8FAFC',
            color: '#0F172A',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Open Modal Workspace
        </button>
      </div>

      <div
        style={{
          borderRadius: '32px',
          border: '1px solid rgba(15, 23, 42, 0.08)',
          backgroundColor: 'rgba(255,255,255,0.88)',
          padding: '28px',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '24px',
            border: '1px dashed #CBD5E1',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            textAlign: 'center',
            color: '#64748B',
            fontSize: '15px',
            lineHeight: 1.7,
          }}
        >
          Close the modal to compare it against the blank landing surface or the inline send workspace.
        </div>
      </div>
    </div>
  </div>
);

const Workspace = ({
  variant,
  chats,
  currentChatId,
  messages,
  documentContent,
  parsedDoc,
  activeTab,
  setActiveTab,
  input,
  setInput,
  isLoading,
  onSubmit,
  onStartNewChat,
  onDeleteChat,
  onSelectChat,
  apiKey,
  saveApiKey,
  systemPrompt,
  saveSystemPrompt,
  enabledTools,
  toggleTool,
  selectedModel,
  setSelectedModel,
  customModels,
  addCustomModel,
  removeCustomModel,
  newModelInput,
  setNewModelInput,
  allModels,
  updateCurrentChat,
}: WorkspaceProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, currentChatId]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        backgroundColor: '#F8FAFC',
        borderRadius: variant === 'modal' ? '28px' : 0,
      }}
    >
      <div
        style={{
          width: '68px',
          borderRight: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '18px',
          paddingBottom: '18px',
          gap: '14px',
          background:
            variant === 'modal'
              ? 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)'
              : 'linear-gradient(180deg, #FBFBFC 0%, #F3F4F6 100%)',
        }}
      >
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '12px',
            backgroundColor: '#111827',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '-0.04em',
          }}
        >
          AI
        </div>
        <button
          onClick={() => setShowSettings((currentValue) => !currentValue)}
          style={{
            padding: '10px',
            border: 'none',
            background: showSettings ? '#E5E7EB' : 'transparent',
            cursor: 'pointer',
            color: showSettings ? '#111827' : '#6B7280',
            borderRadius: '12px',
          }}
        >
          <SettingsIcon size={18} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#F8FAFC',
          position: 'relative',
        }}
      >
        <header
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} color="#6B7280" />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>Company Profile</div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                AI-guided information collection
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              backgroundColor: '#E5E7EB',
              borderRadius: '12px',
              padding: '3px',
              gap: '4px',
            }}
          >
            <button
              onClick={() => setActiveTab('visual')}
              style={{
                padding: '7px 14px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeTab === 'visual' ? 'white' : 'transparent',
                color: activeTab === 'visual' ? '#111827' : '#6B7280',
              }}
            >
              Visual
            </button>
            <button
              onClick={() => setActiveTab('json')}
              style={{
                padding: '7px 14px',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: activeTab === 'json' ? 'white' : 'transparent',
                color: activeTab === 'json' ? '#111827' : '#6B7280',
              }}
            >
              JSON
            </button>
          </div>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '32px',
          }}
        >
          {activeTab === 'json' ? (
            <textarea
              value={documentContent}
              onChange={(event) => updateCurrentChat({ documentContent: event.target.value })}
              style={{
                width: '100%',
                maxWidth: '860px',
                height: '100%',
                minHeight: '100%',
                padding: '24px',
                fontSize: '13px',
                lineHeight: 1.6,
                border: '1px solid #E5E7EB',
                borderRadius: '24px',
                outline: 'none',
                resize: 'none',
                color: '#111827',
                fontFamily: 'monospace',
                backgroundColor: '#FFFFFF',
                boxShadow: '0 16px 40px rgba(15, 23, 42, 0.04)',
              }}
            />
          ) : (
            <div style={{ width: '100%', maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '30px',
                  padding: '36px',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.05)',
                  display: 'flex',
                  gap: '28px',
                  alignItems: 'flex-start',
                }}
              >
                {parsedDoc?.brand_foundation.logo.value ? (
                  <img
                    src={parsedDoc.brand_foundation.logo.value}
                    alt="Brand logo"
                    style={{ width: '120px', height: '120px', objectFit: 'contain', borderRadius: '18px' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '120px',
                      height: '120px',
                      backgroundColor: '#EEF2F7',
                      borderRadius: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <LayoutGrid size={38} color="#9CA3AF" />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <h1 style={{ margin: 0, fontSize: '34px', fontWeight: 800, letterSpacing: '-0.04em', color: '#111827' }}>
                    {parsedDoc?.brand_foundation.company_name.value || 'Brand Profile'}
                  </h1>
                  <div style={{ marginTop: '10px', color: '#6B7280', fontSize: '14px', fontStyle: 'italic' }}>
                    {parsedDoc?.brand_foundation.brand_voice_tone.value || 'Awaiting voice and tone definition.'}
                  </div>
                  {parsedDoc?.brand_foundation.website_url.value && (
                    <a
                      href={parsedDoc.brand_foundation.website_url.value}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        marginTop: '18px',
                        textDecoration: 'none',
                        color: '#111827',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: '1px solid #E5E7EB',
                        padding: '8px 14px',
                        borderRadius: '999px',
                      }}
                    >
                      Visit Website
                    </a>
                  )}
                </div>
              </div>

              <div
                style={{
                  backgroundColor: 'white',
                  borderRadius: '30px',
                  border: '1px solid #E5E7EB',
                  overflow: 'hidden',
                  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.05)',
                }}
              >
                <div
                  style={{
                    padding: '24px 28px',
                    borderBottom: '1px solid #E5E7EB',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                    Product: {parsedDoc?.product.product_name.value || '—'}
                  </h3>
                </div>
                <div style={{ padding: '28px', display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        marginBottom: '10px',
                      }}
                    >
                      Description
                    </div>
                    <div style={{ fontSize: '15px', lineHeight: 1.7, color: '#334155' }}>
                      {parsedDoc?.product.short_description.value || 'No description provided.'}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#94A3B8',
                        textTransform: 'uppercase',
                        letterSpacing: '0.12em',
                        marginTop: '24px',
                        marginBottom: '12px',
                      }}
                    >
                      Key USPs
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {parsedDoc?.product.key_features_benefits.value.length ? (
                        parsedDoc.product.key_features_benefits.value.map((feature, index) => (
                          <div
                            key={`${feature}-${index}`}
                            style={{
                              padding: '8px 14px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E5E7EB',
                              borderRadius: '999px',
                              fontSize: '13px',
                              color: '#0F172A',
                            }}
                          >
                            {feature}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: '#94A3B8' }}>—</div>
                      )}
                    </div>
                  </div>

                  {parsedDoc?.product.product_imagery.value[0] ? (
                    <img
                      src={parsedDoc.product.product_imagery.value[0]}
                      alt="Product imagery"
                      style={{
                        width: '220px',
                        height: '220px',
                        borderRadius: '24px',
                        objectFit: 'cover',
                        border: '1px solid #E5E7EB',
                      }}
                    />
                  ) : null}
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '18px', color: '#111827' }}>
                  Customer Avatars
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
                  {parsedDoc?.customers.avatars.value.length ? (
                    parsedDoc.customers.avatars.value.map((avatar, index) => (
                      <div
                        key={`${avatar.name ?? 'avatar'}-${index}`}
                        style={{
                          backgroundColor: 'white',
                          borderRadius: '24px',
                          padding: '24px',
                          border: '1px solid #E5E7EB',
                          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.05)',
                        }}
                      >
                        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px', color: '#111827' }}>
                          {avatar.name || 'Untitled persona'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.6 }}>
                          {avatar.description || 'Awaiting persona summary.'}
                        </div>

                        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.12em' }}>
                            DREAM OUTCOME
                          </div>
                          <div style={{ fontSize: '14px', color: '#0F172A', marginTop: '6px', lineHeight: 1.6 }}>
                            {avatar.dream_outcome || '—'}
                          </div>
                        </div>

                        <div style={{ marginTop: '14px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', letterSpacing: '0.12em' }}>
                            PAINS
                          </div>
                          <div style={{ fontSize: '14px', color: '#0F172A', marginTop: '6px', lineHeight: 1.6 }}>
                            {avatar.pains_fears || '—'}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        color: '#94A3B8',
                        textAlign: 'center',
                        padding: '42px',
                        border: '2px dashed #CBD5E1',
                        borderRadius: '24px',
                        backgroundColor: 'rgba(255,255,255,0.7)',
                        gridColumn: '1 / -1',
                      }}
                    >
                      Researching target audience...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          width: '440px',
          maxWidth: '36vw',
          minWidth: '380px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          borderLeft: '1px solid #E5E7EB',
          backgroundColor: 'white',
        }}
      >
        <header
          style={{
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 16px',
            borderBottom: '1px solid #F1F5F9',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setShowHistory((currentValue) => !currentValue)}
              style={{
                padding: '8px',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '10px',
                color: showHistory ? '#111827' : '#94A3B8',
                backgroundColor: showHistory ? '#F1F5F9' : 'transparent',
              }}
            >
              <History size={18} />
            </button>
            <button
              onClick={onStartNewChat}
              style={{
                padding: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '10px',
                color: '#94A3B8',
              }}
            >
              <Plus size={18} />
            </button>
            <button
              onClick={() => {
                if (currentChatId) {
                  onDeleteChat(currentChatId);
                }
              }}
              style={{
                padding: '8px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                borderRadius: '10px',
                color: '#94A3B8',
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        {showHistory && (
          <div
            style={{
              position: 'absolute',
              top: '64px',
              left: '16px',
              right: '16px',
              zIndex: 20,
              backgroundColor: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
              overflow: 'hidden',
              maxHeight: '400px',
            }}
          >
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => {
                  onSelectChat(chat.id);
                  setShowHistory(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  border: 'none',
                  background: currentChatId === chat.id ? '#F8FAFC' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: currentChatId === chat.id ? 700 : 500, color: '#111827' }}>
                  {chat.title}
                </span>
                <Trash2
                  size={14}
                  color="#CBD5E1"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                />
              </button>
            ))}
          </div>
        )}

        {showSettings && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div
              style={{
                backgroundColor: 'white',
                width: '100%',
                maxWidth: '460px',
                borderRadius: '28px',
                padding: '32px',
                border: '1px solid #E5E7EB',
                boxShadow: '0 32px 72px rgba(15, 23, 42, 0.2)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '24px',
                }}
              >
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#111827' }}>Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
                >
                  <X size={22} />
                </button>
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '10px',
                  }}
                >
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => saveApiKey(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#F8FAFC',
                  }}
                />
              </div>

              <div style={{ marginBottom: '28px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '10px',
                  }}
                >
                  System Prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(event) => saveSystemPrompt(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#F8FAFC',
                    minHeight: '140px',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    fontFamily: 'monospace',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ marginBottom: '28px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Model Selection</label>
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '11px', color: '#2563EB', textDecoration: 'none' }}
                  >
                    Find more models
                  </a>
                </div>
                <select
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#F8FAFC',
                    fontSize: '14px',
                    marginBottom: '8px',
                  }}
                >
                  {allModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>

                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <input
                    type="text"
                    placeholder="Add custom model ID"
                    value={newModelInput}
                    onChange={(event) => setNewModelInput(event.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #E5E7EB',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    onClick={addCustomModel}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #E5E7EB',
                      borderRadius: '10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Add
                  </button>
                </div>

                {customModels.length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {customModels.map((modelId) => (
                      <div
                        key={modelId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          backgroundColor: '#F1F5F9',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                      >
                        <span>{modelId}</span>
                        <button
                          onClick={() => removeCustomModel(modelId)}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: '#94A3B8',
                            padding: '0 2px',
                            fontWeight: 700,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '12px',
                  }}
                >
                  Capabilities
                </label>
                {AVAILABLE_TOOLS.map((tool) => (
                  <label
                    key={tool}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: '1px solid #E2E8F0',
                      cursor: 'pointer',
                      marginBottom: '8px',
                    }}
                  >
                    <input type="checkbox" checked={enabledTools.includes(tool)} onChange={() => toggleTool(tool)} />
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>{tool.replaceAll('_', ' ')}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={() => setShowSettings(false)}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#111827',
                  color: 'white',
                  borderRadius: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  maxWidth: '88%',
                  borderRadius: '18px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  backgroundColor: message.role === 'user' ? '#111827' : '#F8FAFC',
                  color: message.role === 'user' ? 'white' : '#111827',
                  border: message.role === 'user' ? 'none' : '1px solid #E5E7EB',
                }}
              >
                {message.toolCalls?.map((tool, index) => (
                  <ToolCallToken key={`${tool.id}-${index}`} tool={tool} />
                ))}
                <div style={{ lineHeight: 1.7 }}>
                  <ReactMarkdown
                    components={{
                      img: (props) => (
                        <img
                          {...props}
                          alt={props.alt ?? ''}
                          style={{
                            maxWidth: '200px',
                            height: 'auto',
                            borderRadius: '8px',
                            margin: '8px 0',
                          }}
                        />
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
                {message.links?.map((link, index) => (
                  <LinkCard key={`${link}-${index}`} url={link} />
                ))}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              style={{
                marginTop: '4px',
                padding: '10px',
                border: '1px solid #E5E7EB',
                borderRadius: '14px',
                backgroundColor: '#F8FAFC',
                color: '#64748B',
                cursor: 'pointer',
              }}
            >
              <SettingsIcon size={18} />
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmit();
              }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void onSubmit();
                  }
                }}
                placeholder="Describe the company or paste a URL..."
                style={{
                  width: '100%',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E5E7EB',
                  borderRadius: '18px',
                  padding: '16px',
                  minHeight: '88px',
                  outline: 'none',
                  resize: 'vertical',
                  fontSize: '14px',
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  backgroundColor: input.trim() && !isLoading ? '#111827' : '#CBD5E1',
                  color: 'white',
                  fontWeight: 600,
                  cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  border: 'none',
                }}
              >
                {isLoading ? 'Working...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const { chats, setChats, currentChatId, setCurrentChatId, currentChat } = useChatPersistence();
  const [activeView, setActiveView] = useState<ViewMode>('landing');
  const [showModalWorkspace, setShowModalWorkspace] = useState(false);
  const [documentTab, setDocumentTab] = useState<DocumentTab>('visual');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.apiKey) || '');
  const [systemPrompt, setSystemPrompt] = useState(
    () => localStorage.getItem(STORAGE_KEYS.systemPrompt) || DEFAULT_SYSTEM_PROMPT,
  );
  const [enabledTools, setEnabledTools] = useState<ToolName[]>(() =>
    readStoredJson<ToolName[]>(STORAGE_KEYS.enabledTools, AVAILABLE_TOOLS),
  );
  const [selectedModel, setSelectedModelState] = useState(
    () => localStorage.getItem(STORAGE_KEYS.selectedModel) || DEFAULT_MODELS[0].id,
  );
  const [customModels, setCustomModels] = useState<string[]>(() =>
    readStoredJson<string[]>(STORAGE_KEYS.customModels, []),
  );
  const [newModelInput, setNewModelInput] = useState('');

  useEffect(() => {
    if (chats.length === 0) {
      const newChat: Chat = {
        id: Date.now().toString(),
        title: DEFAULT_CHAT_TITLE,
        messages: [],
        documentContent: INITIAL_DOCUMENT,
        createdAt: Date.now(),
      };
      setChats([newChat]);
      setCurrentChatId(newChat.id);
      return;
    }

    if (!currentChatId) {
      setCurrentChatId(chats[0].id);
    }
  }, [chats, currentChatId, setChats, setCurrentChatId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.enabledTools, JSON.stringify(enabledTools));
  }, [enabledTools]);

  const allModels = useMemo(
    () => [...DEFAULT_MODELS, ...customModels.map((modelId) => ({ id: modelId, name: modelId }))],
    [customModels],
  );

  const messages = currentChat?.messages ?? EMPTY_MESSAGES;
  const documentContent = currentChat?.documentContent ?? INITIAL_DOCUMENT;

  const parsedDoc = useMemo(() => {
    try {
      return JSON.parse(documentContent) as ProfileDocument;
    } catch {
      return null;
    }
  }, [documentContent]);

  const updateCurrentChat = (updates: Partial<Chat>) => {
    if (!currentChatId) {
      return;
    }

    setChats((existingChats) =>
      existingChats.map((chat) => (chat.id === currentChatId ? { ...chat, ...updates } : chat)),
    );
  };

  const startNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: DEFAULT_CHAT_TITLE,
      messages: [],
      documentContent: INITIAL_DOCUMENT,
      createdAt: Date.now(),
    };
    setChats((existingChats) => [newChat, ...existingChats]);
    setCurrentChatId(newChat.id);
  };

  const deleteChat = (id: string) => {
    const nextChats = chats.filter((chat) => chat.id !== id);

    if (nextChats.length === 0) {
      const replacementChat: Chat = {
        id: Date.now().toString(),
        title: DEFAULT_CHAT_TITLE,
        messages: [],
        documentContent: INITIAL_DOCUMENT,
        createdAt: Date.now(),
      };
      setChats([replacementChat]);
      setCurrentChatId(replacementChat.id);
      return;
    }

    setChats(nextChats);
    if (currentChatId === id) {
      setCurrentChatId(nextChats[0].id);
    }
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
  };

  const saveSystemPrompt = (prompt: string) => {
    setSystemPrompt(prompt);
    localStorage.setItem(STORAGE_KEYS.systemPrompt, prompt);
  };

  const setSelectedModel = (modelId: string) => {
    setSelectedModelState(modelId);
    localStorage.setItem(STORAGE_KEYS.selectedModel, modelId);
  };

  const toggleTool = (toolName: ToolName) => {
    setEnabledTools((currentTools) =>
      currentTools.includes(toolName)
        ? currentTools.filter((tool) => tool !== toolName)
        : [...currentTools, toolName],
    );
  };

  const addCustomModel = () => {
    const trimmedModelId = newModelInput.trim();
    if (!trimmedModelId || customModels.includes(trimmedModelId)) {
      return;
    }

    const updatedModels = [...customModels, trimmedModelId];
    setCustomModels(updatedModels);
    localStorage.setItem(STORAGE_KEYS.customModels, JSON.stringify(updatedModels));
    setSelectedModel(trimmedModelId);
    setNewModelInput('');
  };

  const removeCustomModel = (modelId: string) => {
    const updatedModels = customModels.filter((model) => model !== modelId);
    setCustomModels(updatedModels);
    localStorage.setItem(STORAGE_KEYS.customModels, JSON.stringify(updatedModels));

    if (selectedModel === modelId) {
      setSelectedModel(DEFAULT_MODELS[0].id);
    }
  };

  const submitCurrentInput = async () => {
    if (!input.trim() || isLoading || !currentChatId) {
      return;
    }

    if (!apiKey) {
      window.alert('Please set your OpenRouter API key in settings first.');
      return;
    }

    const submittedInput = input.trim();
    const userLinks = extractLinks(submittedInput);
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: submittedInput,
      links: userLinks.length ? userLinks : undefined,
    };

    let updatedMessages = [...messages, userMessage];
    const nextTitle =
      messages.length === 0
        ? `${submittedInput.slice(0, 30)}${submittedInput.length > 30 ? '...' : ''}`
        : currentChat?.title || DEFAULT_CHAT_TITLE;

    updateCurrentChat({ messages: updatedMessages, title: nextTitle });
    setInput('');
    setIsLoading(true);

    try {
      const tools = buildTools(enabledTools);
      const currentMessages: ConversationMessage[] = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.map((message) => ({
          role: message.role === 'tool' ? 'assistant' : message.role,
          content: message.content,
        })) as Array<{ role: 'user' | 'assistant'; content: string }>,
      ];

      let loopCount = 0;
      let assistantMessage: AssistantApiMessage | null = null;
      let nextDocumentContent = documentContent;

      while (loopCount < 35) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Title': 'AI Onboarding Demo',
            'HTTP-Referer': window.location.origin,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: currentMessages,
            tools: tools.length ? tools : undefined,
          }),
        });

        const data = (await response.json()) as ChatCompletionResponse;

        if (!response.ok) {
          throw new Error(data.error?.message || 'OpenRouter request failed.');
        }

        assistantMessage = data.choices?.[0]?.message ?? null;
        if (!assistantMessage) {
          throw new Error('OpenRouter returned no assistant message.');
        }

        if (!assistantMessage.tool_calls?.length) {
          break;
        }

        currentMessages.push({
          role: 'assistant',
          content: assistantMessage.content ?? '',
          tool_calls: assistantMessage.tool_calls,
        });

        const callInfos: ToolCall[] = [];
        let documentWasUpdated = false;

        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments) as { content?: string; url?: string };
          const callInfo: ToolCall = {
            id: toolCall.id,
            name: functionName,
            arguments: JSON.stringify(args),
            status: 'loading',
          };
          callInfos.push(callInfo);

          let toolResult = '';

          try {
            if (functionName === 'update_document') {
              if (!args.content) {
                throw new Error('Missing content argument.');
              }

              const incomingJson = JSON.parse(args.content) as unknown;
              if (validateDocumentStructure(incomingJson)) {
                nextDocumentContent = args.content;
                toolResult = 'Success.';
                documentWasUpdated = true;
              } else {
                toolResult =
                  'Error: Invalid document structure. You are not allowed to change the keys or nesting of the JSON. Please only update the values and sources within the existing fields.';
              }
            } else if (functionName === 'read_document') {
              toolResult = nextDocumentContent;
            } else if (functionName === 'browse_website') {
              if (!args.url) {
                throw new Error('Missing url argument.');
              }

              const browseResponse = await fetch(`https://r.jina.ai/${args.url}`);
              toolResult = (await browseResponse.text()).slice(0, 15000);
            }

            callInfo.status = 'success';
            callInfo.result = toolResult;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            toolResult = `Error: ${message}`;
            callInfo.status = 'error';
            callInfo.result = toolResult;
          }

          currentMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: functionName,
            content: toolResult,
          });
        }

        if (documentWasUpdated) {
          updateCurrentChat({ documentContent: nextDocumentContent });
        }

        updatedMessages = [
          ...updatedMessages,
          {
            id: `tool-${Date.now()}-${loopCount}`,
            role: 'assistant',
            content: '',
            toolCalls: callInfos,
          },
        ];
        updateCurrentChat({ messages: updatedMessages });
        loopCount += 1;
      }

      const finalContent = assistantMessage?.content || 'Updated.';
      const finalMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: finalContent,
        links: extractLinks(finalContent),
      };

      updateCurrentChat({
        messages: [...updatedMessages, finalMessage],
        documentContent: nextDocumentContent,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      console.error(error);
      window.alert(message);
    } finally {
      setIsLoading(false);
    }
  };

  const workspaceProps: WorkspaceProps = {
    variant: 'inline',
    chats,
    currentChatId,
    messages,
    documentContent,
    parsedDoc,
    activeTab: documentTab,
    setActiveTab: setDocumentTab,
    input,
    setInput,
    isLoading,
    onSubmit: submitCurrentInput,
    onStartNewChat: startNewChat,
    onDeleteChat: deleteChat,
    onSelectChat: setCurrentChatId,
    apiKey,
    saveApiKey,
    systemPrompt,
    saveSystemPrompt,
    enabledTools,
    toggleTool,
    selectedModel,
    setSelectedModel,
    customModels,
    addCustomModel,
    removeCustomModel,
    newModelInput,
    setNewModelInput,
    allModels,
    updateCurrentChat,
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#F4F6F8',
        color: '#111827',
        fontFamily:
          '"Instrument Sans", "Avenir Next", "Segoe UI", sans-serif',
      }}
    >
      <aside
        style={{
          width: '112px',
          borderRight: '1px solid #E5E7EB',
          background: 'linear-gradient(180deg, #0F172A 0%, #111827 100%)',
          color: 'white',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '18px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              marginBottom: '32px',
            }}
          >
            Lab
          </div>

          {[
            { id: 'landing' as ViewMode, label: 'Blank', icon: <FileText size={16} /> },
            { id: 'send' as ViewMode, label: 'Send', icon: <Send size={16} /> },
            { id: 'modal' as ViewMode, label: 'Modal', icon: <LayoutGrid size={16} /> },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id);
                if (item.id === 'modal') {
                  setShowModalWorkspace(true);
                }
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                marginBottom: '10px',
                borderRadius: '16px',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                backgroundColor:
                  activeView === item.id ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: 'white',
              }}
            >
              {item.icon}
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{item.label}</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize: '11px', lineHeight: 1.5, color: 'rgba(255,255,255,0.58)' }}>
          Switch between the empty landing state, inline chat, and modal onboarding flow.
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {activeView === 'landing' && (
          <LandingPage
            onOpenSend={() => setActiveView('send')}
            onOpenModal={() => {
              setActiveView('modal');
              setShowModalWorkspace(true);
            }}
          />
        )}

        {activeView === 'send' && <Workspace {...workspaceProps} variant="inline" />}

        {activeView === 'modal' && (
          <ModalPreviewPage
            onOpenModal={() => {
              setShowModalWorkspace(true);
            }}
          />
        )}

        {showModalWorkspace && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 200,
              backgroundColor: 'rgba(15, 23, 42, 0.46)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
            }}
          >
            <div
              style={{
                width: 'min(1440px, calc(100vw - 48px))',
                height: 'min(920px, calc(100vh - 48px))',
                backgroundColor: 'white',
                borderRadius: '32px',
                overflow: 'hidden',
                boxShadow: '0 40px 100px rgba(15, 23, 42, 0.28)',
                position: 'relative',
              }}
            >
              <button
                onClick={() => setShowModalWorkspace(false)}
                style={{
                  position: 'absolute',
                  top: '18px',
                  right: '18px',
                  zIndex: 10,
                  width: '38px',
                  height: '38px',
                  borderRadius: '999px',
                  border: '1px solid rgba(255,255,255,0.25)',
                  backgroundColor: 'rgba(15, 23, 42, 0.72)',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
              <Workspace {...workspaceProps} variant="modal" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
