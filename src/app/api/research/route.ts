import { NextRequest, NextResponse } from "next/server";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { runAgent } from "@/lib/agentRunner";

// Helper function to convert LangChain messages to frontend format
function convertMessagesToFrontend(messages: BaseMessage[]) {
  return messages
    .filter((msg) => {
      // Filter out empty messages and non-relevant types
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      return content && content.trim().length > 0;
    })
    .map((msg) => {
      const messageType = msg.getType();
      let frontendType: "human" | "ai" | "system";

      switch (messageType) {
        case "human":
          frontendType = "human";
          break;
        case "ai":
          frontendType = "ai";
          break;
        case "system":
          frontendType = "system";
          break;
        default:
          frontendType = "ai"; // Default fallback
      }

      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);

      return {
        type: frontendType,
        content: content,
      };
    });
}

export async function POST(request: NextRequest) {
  try {
    const { query, threadId, rankingCriteria } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required and must be a string" },
        { status: 400 }
      );
    }

    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json(
        { error: "ThreadId is required and must be a string" },
        { status: 400 }
      );
    }

    console.log(`API: Processing query "${query}" for thread ${threadId}`);

    // Create message from query
    const messages = [new HumanMessage({ content: query })];

    // Run the agent
    const result = await runAgent({
      messages,
      rankingCriteria,
      threadId,
    });

    console.log("API: Agent result:", {
      hasMessages: result.messages?.length > 0,
      isInterrupted: result.isInterrupted,
      hasPapers: result.papers?.length > 0,
      hasRankedPapers: result.rankedPapers?.length > 0,
      hasGaps: !!result.gaps,
      error: result.error,
    });

    // Debug: log the actual message content
    if (result.messages && result.messages.length > 0) {
      console.log("API: Message details:", {
        messageCount: result.messages.length,
        lastMessageContent:
          result.messages[result.messages.length - 1]?.content,
        lastMessageType:
          result.messages[result.messages.length - 1]?.constructor?.name,
      });
    }

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Convert LangChain messages to frontend format
    const formattedResult = {
      ...result,
      messages: result.messages
        ? convertMessagesToFrontend(result.messages)
        : [],
    };

    console.log("API: Formatted messages for frontend:", {
      messageCount: formattedResult.messages.length,
      messages: formattedResult.messages,
    });

    return NextResponse.json({ result: formattedResult });
  } catch (error) {
    console.error("API Error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Server error: ${error.message}`
            : "An unknown error occurred",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Research Agent API",
    endpoints: {
      POST: "Send research queries",
      body: {
        query: "string (required) - The user's message or research query",
        threadId: "string (required) - Unique identifier for the conversation",
        rankingCriteria:
          "string (optional) - For resuming interrupted workflows",
      },
    },
  });
}
