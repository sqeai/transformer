"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";

const STORAGE_KEY = "ai-data-cleanser-chat-history";
const CHAT_API = "/api/chat";

function loadMessagesFromStorage(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to load chat history:", e);
  }
  return [];
}

function saveMessagesToStorage(messages: UIMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (e) {
    console.error("Failed to save chat history:", e);
  }
}

type ChatContextValue = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: CHAT_API }),
    [],
  );

  const chat = useChat({
    transport,
    onError: (e: Error) => {
      console.error(e);
      toast.error("Error while processing your request", {
        description: e.message,
      });
    },
  });

  const { messages, setMessages } = chat;

  useEffect(() => {
    const stored = loadMessagesFromStorage();
    if (stored.length > 0) setMessages(stored);
  }, [setMessages]);

  useEffect(() => {
    if (messages.length > 0) saveMessagesToStorage(messages);
    else if (typeof window !== "undefined")
      localStorage.removeItem(STORAGE_KEY);
  }, [messages]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    const save = () => {
      const latest = messagesRef.current;
      if (latest.length > 0) saveMessagesToStorage(latest);
      else if (typeof window !== "undefined")
        localStorage.removeItem(STORAGE_KEY);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") save();
    };
    const onPageHide = () => save();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  const value = useMemo(() => chat, [chat]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used within ChatProvider");
  }
  return ctx;
}

export { STORAGE_KEY, loadMessagesFromStorage, saveMessagesToStorage };
