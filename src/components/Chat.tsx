"use client";

import { useState, useEffect } from "react";

interface Message {
  text: string;
  sender: "user" | "agent";
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const firstMessage: Message = {
      text: "Hello! How can I help you today?",
      sender: "agent",
    };
    setMessages([firstMessage]);
    console.log("Initial messages:", [firstMessage]);
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { text: input, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    console.log("User sent:", userMessage);

    setInput("");
    setLoading(true);

    try {
      // Call your Next.js API
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: input,
          threadId: "session_1", // use a fixed thread for now
        }),
      });

      const data = await res.json();
      console.log("API response:", data);

      const agentResponseText =
        data?.result?.messages?.[0]?.text ||
        "Sorry, I couldn't fetch a response.";

      const agentMessage: Message = {
        text: agentResponseText,
        sender: "agent",
      };
      setMessages((prev) => [...prev, agentMessage]);
      console.log("Agent responded:", agentMessage);
    } catch (err) {
      console.error("Error calling API:", err);
      const errorMessage: Message = {
        text: "Error fetching response from agent.",
        sender: "agent",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-3xl h-[80vh] bg-white shadow-md rounded-2xl overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`max-w-[75%] px-4 py-2 rounded-2xl ${
              msg.sender === "agent"
                ? "mr-auto bg-gray-100 text-gray-900"
                : "ml-auto bg-gray-900 text-white"
            }`}
          >
            {msg.text}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="mr-auto max-w-[75%] px-4 py-2 rounded-2xl bg-gray-100 text-gray-900 animate-pulse">
            Thinking...
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t flex items-center gap-2">
        <input
          type="text"
          placeholder="Ask about research papers..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 rounded-xl text-gray-700 border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition"
        >
          Send
        </button>
      </div>
    </div>
  );
}
