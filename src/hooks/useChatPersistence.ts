import { useState, useEffect } from 'react';
import { type Chat } from '../types/index.ts';

const CHAT_STORAGE_KEY = 'ai_onboarding_demo_chats';

export function useChatPersistence() {
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  const currentChat = chats.find(c => c.id === currentChatId) || null;

  return { chats, setChats, currentChatId, setCurrentChatId, currentChat };
}
