"use client";

import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

interface Message {
  type: "human" | "ai" | "system";
  content: string;
}

interface Paper {
  title: string;
  authors: string[];
  published_date?: string;
  abstract: string;
  cited_by_count: number;
  relevance_score?: number;
}

interface ResearchResult {
  messages?: Message[];
  papers?: Paper[];
  rankedPapers?: Paper[];
  gaps?: string;
  isInterrupted: boolean;
  interruptData?: {
    papers_found?: string;
    message?: string;
    options?: string[];
  };
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    { type: "ai", content: "Hello! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId] = useState(() => uuidv4());
  const [waitingForRanking, setWaitingForRanking] = useState(false);
  const [currentResearch, setCurrentResearch] = useState<ResearchResult | null>(
    null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setMessages((prev) => [...prev, { type: "human", content: trimmedInput }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedInput,
          threadId,
          rankingCriteria: waitingForRanking ? trimmedInput : undefined,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { type: "ai", content: `Error: ${data.error}` },
        ]);
        setLoading(false);
        return;
      }

      const result: ResearchResult = data.result;

      // Handle interrupted workflow
      if (result.isInterrupted && result.interruptData) {
        setWaitingForRanking(true);
        setCurrentResearch(result);

        const papersFound = result.interruptData.papers_found || "";
        const messageText = result.interruptData.message || "";
        const options = result.interruptData.options || [];

        const papersMessage = `Found ${
          result.papers?.length || 0
        } papers:\n\n${papersFound}\n\n${messageText}`;
        setMessages((prev) => [
          ...prev,
          { type: "ai", content: papersMessage },
        ]);

        if (options.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              type: "system",
              content: `Please choose a ranking criteria: ${options.join(
                ", "
              )}`,
            },
          ]);
        }
      } else {
        setWaitingForRanking(false);

        // Append any messages from the agent
        if (result.messages && result.messages.length > 0) {
          const aiMessages = result.messages
            .filter((m) => m.content.trim() !== "")
            .map((m) => ({ type: "ai" as const, content: m.content }));

          setMessages((prev) => [...prev, ...aiMessages]);
        }

        // Display research results if available
        if (result.rankedPapers && result.rankedPapers.length > 0) {
          displayResearchResults(result);
        } else if (
          (!result.messages || result.messages.length === 0) &&
          !result.rankedPapers
        ) {
          setMessages((prev) => [
            ...prev,
            {
              type: "ai",
              content:
                "I'm here to help! You can ask me about research papers or chat normally.",
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        { type: "ai", content: "Error: Failed to get a response." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const displayResearchResults = (result: ResearchResult) => {
    if (!result.rankedPapers) return;

    const papersText = result.rankedPapers
      .map(
        (paper, index) =>
          `**${index + 1}. ${paper.title}**\n` +
          `📊 *Citations:* ${paper.cited_by_count} | ` +
          `📅 *Published:* ${paper.published_date || "N/A"}\n` +
          `👥 *Authors:* ${paper.authors.slice(0, 4).join(", ")}${
            paper.authors.length > 4 ? " et al." : ""
          }\n\n` +
          `📄 **Abstract:**\n${paper.abstract}\n`
      )
      .join("\n" + "─".repeat(80) + "\n\n");

    setMessages((prev) => [
      ...prev,
      { type: "ai", content: `📚 **Top Ranked Papers:**\n\n${papersText}` },
    ]);

    if (result.gaps) {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            type: "ai",
            content: `🔍 **Research Gap Analysis:**\n\n${result.gaps}`,
          },
        ]);
      }, 1500);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            type: "ai",
            content:
              "💬 Feel free to ask more about these papers, explore specific aspects, or request research on a different topic!",
          },
        ]);
      }, 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  const handleQuickRanking = (criteria: string) => {
    setInput(criteria);
    setTimeout(() => handleSend(), 100);
  };

  return (
    <div className="flex flex-col w-full max-w-4xl h-[80vh] bg-white shadow-md rounded-2xl overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i}>
            <div
              className={`px-4 py-3 rounded-2xl max-w-[85%] whitespace-pre-wrap ${
                m.type === "human"
                  ? "ml-auto bg-indigo-500 text-white"
                  : m.type === "system"
                  ? "mx-auto bg-yellow-100 text-yellow-800 border border-yellow-200 text-center"
                  : "mr-auto bg-gray-100 text-gray-900"
              }`}
            >
              {m.content}
            </div>

            {/* Quick ranking buttons */}
            {m.type === "system" &&
              waitingForRanking &&
              i === messages.length - 1 && (
                <div className="flex gap-2 justify-center mt-2">
                  {currentResearch?.interruptData?.options?.map((criteria) => (
                    <button
                      key={criteria}
                      onClick={() => handleQuickRanking(criteria)}
                      className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition capitalize text-sm"
                    >
                      {criteria}
                    </button>
                  ))}
                </div>
              )}
          </div>
        ))}

        {loading && (
          <div className="mr-auto bg-gray-100 px-4 py-2 rounded-2xl max-w-[75%] flex items-center gap-2">
            <div className="animate-pulse">Thinking...</div>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.1s" }}
              ></div>
              <div
                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              ></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 border-t bg-gray-50">
        {waitingForRanking && (
          <div className="mb-2 text-sm text-gray-600 text-center">
            💡 You can type your choice or click the buttons above
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder={
              waitingForRanking
                ? "Type ranking criteria (citations, recency, or relevance)..."
                : "Ask about research papers or chat normally..."
            }
            className="flex-1 rounded-xl text-gray-700 border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
          <button
            className={`px-6 py-3 rounded-xl transition font-medium cursor-pointer ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : waitingForRanking
                ? "bg-green-600 hover:bg-green-700"
                : "bg-cyan-500 hover:bg-cyan-600"
            } text-white`}
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            {loading ? "..." : waitingForRanking ? "Submit" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
