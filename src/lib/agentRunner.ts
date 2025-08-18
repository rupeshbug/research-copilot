import { workflow } from "./agent";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";

interface Paper {
  title: string;
  authors: string[];
  published_date?: string;
  abstract: string;
  cited_by_count: number;
  relevance_score?: number;
}

interface RunAgentProps {
  messages?: BaseMessage[];
  rankingCriteria?: string;
  threadId: string;
}

interface InterruptData {
  papers_found?: string;
  message?: string;
  options?: string[];
}

interface AgentResponse {
  messages: BaseMessage[];
  isInterrupted: boolean;
  interruptData?: InterruptData;
  papers: Paper[];
  rankedPapers: Paper[];
  gaps?: string;
  error?: string;
}

export async function runAgent({
  messages = [],
  rankingCriteria,
  threadId,
}: RunAgentProps): Promise<AgentResponse> {
  const threadConfig = { configurable: { thread_id: threadId } };

  try {
    let workflowResult: {
      messages?: BaseMessage[];
      papers?: Paper[];
      rankedPapers?: Paper[];
      gaps?: string;
    } = {};

    // Resume from interrupt with ranking criteria
    if (rankingCriteria) {
      workflowResult = await workflow.invoke(
        new Command({ resume: rankingCriteria }),
        threadConfig
      );

      return {
        messages: workflowResult.messages ?? [],
        isInterrupted: false,
        papers: workflowResult.papers ?? [],
        rankedPapers: workflowResult.rankedPapers ?? [],
        gaps: workflowResult.gaps,
      };
    }

    // Initial run: if no messages, start with greeting
    if (messages.length === 0) {
      messages = [
        new HumanMessage({ content: "Hello! How can I help you today?" }),
      ];
    }

    const lastMessage = messages[messages.length - 1];
    const query =
      typeof lastMessage.content === "string" ? lastMessage.content : "";

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

    // Get current workflow state to check for interruption
    const currentState = await workflow.getState(threadConfig);

    // Workflow waiting for ranking criteria
    if (currentState.next?.includes("askRankingCriteria")) {
      const papers: Paper[] = currentState.values.papers ?? [];
      const interruptData: InterruptData = {
        papers_found: papers.map((p) => p.title).join("\n"),
        message: `Found ${papers.length} papers. How would you like to rank them?`,
        options: ["citations", "recency", "relevance"],
      };

      return {
        messages: currentState.values.messages ?? [],
        isInterrupted: true,
        interruptData,
        papers,
        rankedPapers: currentState.values.rankedPapers ?? [],
        gaps: currentState.values.gaps,
      };
    }

    // Normal workflow completion
    const finalState = await workflow.getState(threadConfig);

    return {
      messages: finalState.values.messages ?? [],
      isInterrupted: false,
      papers: finalState.values.papers ?? [],
      rankedPapers: finalState.values.rankedPapers ?? [],
      gaps: finalState.values.gaps,
    };
  } catch (error) {
    console.error("Error in workflow:", error);
    return {
      messages: [],
      isInterrupted: false,
      papers: [],
      rankedPapers: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// Helper to check if a thread has active interrupt
export async function checkInterruptStatus(threadId: string) {
  const threadConfig = { configurable: { thread_id: threadId } };

  try {
    const currentState = await workflow.getState(threadConfig);
    return {
      isInterrupted: currentState.next?.includes("askRankingCriteria") ?? false,
      nextNodes: currentState.next ?? [],
      papers: currentState.values.papers ?? [],
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
