import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Bot, MessageSquare, Send, X } from "lucide-react";
import { fetchJson, getApiMessage } from "../api";
import { API_BASE_URL } from "../config";
import type { LoggedInUser } from "../types";

type ChatRecord = {
  title: string;
  subtitle: string;
  meta?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string[];
  records?: ChatRecord[];
};

type ChatResponse = {
  answer?: string[];
  records?: ChatRecord[];
  suggestions?: string[];
  message?: string;
};

type AiChatAssistantProps = {
  user: LoggedInUser;
};

const CHAT_OPEN_KEY = "airtel-ims-ai-chat-open";

function getStarterPrompts(role: string) {
  if (role === "employee") {
    return [
      "What is the status of my request?",
      "Which devices are assigned to me?",
      "How do I return a device?",
      "How is device depreciation calculated?",
      "How does replacement recommendation work?",
      "What makes this project special?",
    ];
  }

  if (role === "IT Support engineer" || role === "IT officer") {
    return [
      "How many devices are available in my branch?",
      "Show assets under maintenance",
      "What requests are waiting for fulfillment?",
      "How is device depreciation calculated?",
      "Which devices should be reviewed for replacement?",
      "What makes this project special?",
    ];
  }

  if (role === "IT Director" || role === "IT infrastructure manager") {
    return [
      "What requests are waiting for IT approval?",
      "Summarize open issues",
      "Show maintenance workload",
      "How is device depreciation calculated?",
      "How does replacement recommendation work?",
      "What makes this project special?",
    ];
  }

  if (role === "IT Security manager") {
    return [
      "What requests are waiting for security review?",
      "Summarize open issues",
      "Show maintenance workload",
      "How is device depreciation calculated?",
      "How does replacement recommendation work?",
      "What makes this project special?",
    ];
  }

  if (role === "HR DIRECTOR" || role === "HR Recruitment officer" || role === "Hr department") {
    return [
      "What requests are waiting for HR approval?",
      "How does the request workflow work?",
      "Summarize pending requests",
      "How is device depreciation calculated?",
      "How does replacement recommendation work?",
      "What makes this project special?",
    ];
  }

  return [
    "How many users do we have in the system?",
    "Give me a full system overview",
    "How is device depreciation calculated?",
    "How does replacement recommendation work?",
    "Summarize inventory status",
    "Show pending requests",
    "Find asset TAG-102",
    "What makes this project special?",
  ];
}

function AiChatAssistant({ user }: AiChatAssistantProps) {
  const starterPrompts = useMemo(() => getStarterPrompts(user.role), [user.role]);
  const [isOpen, setIsOpen] = useState(() => {
    // Never auto-open: even if something previously left it open, start closed.
    try {
      window.localStorage.setItem(CHAT_OPEN_KEY, "0");
    } catch {
      // ignore
    }
    return false;
  });
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: [
        `Hello ${user.firstName}. I am your Airtel IMS assistant.`,
        "I can answer questions about requests, approvals, assignments, inventory, returns, maintenance, issues, depreciation, replacement recommendations, workflow steps, and broader work questions while keeping system records unchanged.",
      ],
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>(starterPrompts);

  useEffect(() => {
    // Extra safety: if the component remounts (route/app refresh), keep it closed.
    setIsOpen(false);
    try {
      window.localStorage.setItem(CHAT_OPEN_KEY, "0");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [isOpen, chatMessages.length, isSending]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();

    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: [trimmed],
    };

    setChatMessages((current) => [...current, userMessage]);
    setMessage("");
    setIsSending(true);

    try {
      const { response, data } = await fetchJson<ChatResponse>(`${API_BASE_URL}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          message: trimmed,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "The Airtel IMS assistant could not answer right now."));
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: data?.answer?.length ? data.answer : ["I could not generate a useful answer for that just yet."],
        records: data?.records ?? [],
      };

      setChatMessages((current) => [...current, assistantMessage]);
      setSuggestions(data?.suggestions?.length ? data.suggestions : starterPrompts);
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: [error instanceof Error ? error.message : "The Airtel IMS assistant is unavailable right now."],
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage(message);
  };

  return (
    <div className="ai-chat-shell">
      {isOpen ? (
        <section className="ai-chat-panel" aria-label="Airtel IMS assistant">
          <header className="ai-chat-header">
            <div className="ai-chat-title-group">
              <span className="ai-chat-badge">
                <Bot size={15} strokeWidth={2.2} />
                Smart assistant
              </span>
              <strong>Airtel IMS Assistant</strong>
            </div>
            <button
              className="ai-chat-close"
              type="button"
              onClick={() => {
                setIsOpen(false);
                try {
                  window.localStorage.setItem(CHAT_OPEN_KEY, "0");
                } catch {
                  // ignore
                }
              }}
              aria-label="Close assistant"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </header>

          <div className="ai-chat-messages">
            {chatMessages.map((item) => (
              <article key={item.id} className={`ai-chat-message ai-chat-message-${item.role}`}>
                <div className="ai-chat-bubble">
                  {item.text.map((line, index) => (
                    <p key={`${item.id}-${index}`}>{line}</p>
                  ))}
                </div>
                {item.records?.length ? (
                  <div className="ai-chat-records">
                    {item.records.map((record, index) => (
                      <article className="ai-chat-record-card" key={`${item.id}-record-${index}`}>
                        <strong>{record.title}</strong>
                        <span>{record.subtitle}</span>
                        {record.meta ? <small>{record.meta}</small> : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {isSending ? <p className="ai-chat-thinking">Thinking through Airtel IMS data...</p> : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-suggestions">
            {suggestions.map((suggestion) => (
              <button key={suggestion} className="ai-chat-suggestion" type="button" onClick={() => void sendMessage(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <form className="ai-chat-form" onSubmit={handleSubmit}>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ask about IMS data, workflow, improvements, writing help, or any work question..."
              disabled={isSending}
            />
            <button className="primary-btn compact-btn ai-chat-send" type="submit" disabled={isSending}>
              <Send size={15} strokeWidth={2.2} />
              <span>{isSending ? "Sending..." : "Ask"}</span>
            </button>
          </form>
        </section>
      ) : null}

      <button
        className="ai-chat-trigger"
        type="button"
        onClick={() => {
          setIsOpen(true);
          try {
            window.localStorage.setItem(CHAT_OPEN_KEY, "1");
          } catch {
            // ignore
          }
        }}
        aria-label="Open Airtel IMS assistant"
        aria-expanded={isOpen}
      >
        <MessageSquare size={18} strokeWidth={2.3} />
        <span>IMS Assistant</span>
      </button>
    </div>
  );
}

export default AiChatAssistant;
