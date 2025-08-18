import { workflow } from "./agent";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";

interface RunAgentProps {
  messages?: BaseMessage[];
  rankingCriteria?: string;
  threadId: string;
}

interface AgentResponse {
  messages: BaseMessage[];
  isInterrupted: boolean;
  interruptData?: {
    papers_found?: string;
    message?: string;
    options?: string[];
  };
  papers?: any[];
  rankedPapers?: any[];
  gaps?: string;
  error?: string;
}

export async function runAgent({
  messages = [],
  rankingCriteria,
  threadId,
}: RunAgentProps): Promise<AgentResponse> {
  console.log("Starting agent with threadId:", threadId);

  const threadConfig = { configurable: { thread_id: threadId } };

  try {
    let workflowResult;

    // If we have ranking criteria, we're resuming from an interrupt
    if (rankingCriteria) {
      console.log(
        `Resuming workflow with ranking criteria: ${rankingCriteria}`
      );

      workflowResult = await workflow.invoke(
        new Command({ resume: rankingCriteria }),
        threadConfig
      );

      return {
        messages: workflowResult.messages || [],
        isInterrupted: false,
        papers: workflowResult.papers,
        rankedPapers: workflowResult.rankedPapers,
        gaps: workflowResult.gaps,
      };
    }

    // Initial run or continuation
    if (messages.length === 0) {
      messages = [
        new HumanMessage({ content: "Hello! How can I help you today?" }),
      ];
    }

    // Extract the user's query from the last message
    const lastMessage = messages[messages.length - 1];
    const query =
      typeof lastMessage.content === "string" ? lastMessage.content : "";

    console.log(`Processing query: ${query}`);

    workflowResult = await workflow.invoke(
      {
        query,
        messages,
        papers: [],
        rankedPapers: [],
        gaps: "",
        rankingCriteria: "",
      },
      threadConfig
    );

    // Check if workflow was interrupted (waiting for ranking criteria)
    const currentState = await workflow.getState(threadConfig);

    if (currentState.next && currentState.next.includes("askRankingCriteria")) {
      console.log("Workflow interrupted - waiting for ranking criteria");

      return {
        messages: currentState.values.messages || [],
        isInterrupted: true,
        interruptData: {
          papers_found:
            currentState.values.papers?.map((p: any) => p.title).join("\n") ||
            "",
          message: `Found ${
            currentState.values.papers?.length || 0
          } papers. How would you like to rank them?`,
          options: ["citations", "recency", "relevance"],
        },
        papers: currentState.values.papers,
      };
    }

    // Normal completion - get the final state
    const finalState = await workflow.getState(threadConfig);
    console.log("Final workflow state:", {
      hasMessages: finalState.values.messages?.length > 0,
      messageCount: finalState.values.messages?.length,
    });

    return {
      messages: finalState.values.messages || [],
      isInterrupted: false,
      papers: finalState.values.papers,
      rankedPapers: finalState.values.rankedPapers,
      gaps: finalState.values.gaps,
    };
  } catch (error) {
    console.error("Error in workflow:", error);

    return {
      messages: [],
      isInterrupted: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Helper function to check if a thread has an active interrupt
export async function checkInterruptStatus(threadId: string) {
  const threadConfig = { configurable: { thread_id: threadId } };

  try {
    const currentState = await workflow.getState(threadConfig);
    return {
      isInterrupted:
        currentState.next && currentState.next.includes("askRankingCriteria"),
      nextNodes: currentState.next,
      papers: currentState.values.papers,
    };
  } catch (error) {
    console.error("Error checking interrupt status:", error);
    return {
      isInterrupted: false,
      nextNodes: [],
      papers: [],
    };
  }
}
