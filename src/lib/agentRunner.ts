import { workflow } from "./agent";
import { MemorySaver } from "@langchain/langgraph";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";

interface RunAgentProps {
  messages?: BaseMessage[];
  rankingCriteria?: string;
  threadId: string;
}

export async function runAgent({
  messages,
  rankingCriteria,
  threadId,
}: RunAgentProps) {
  console.log("Starting agent with threadId:", threadId);

  // In-memory checkpointer
  const checkpointer = new MemorySaver();

  // If no messages are provided, start with greeting
  if (!messages || messages.length === 0) {
    messages = [
      new HumanMessage({
        content: "Hello! How can I help you today?",
      }),
    ];
  }

  // Extract query text safely (LLM requires string)
  const firstMessage = messages[0];
  let queryText: string;
  if ("content" in firstMessage) {
    if (typeof firstMessage.content === "string") {
      queryText = firstMessage.content;
    } else if (Array.isArray(firstMessage.content)) {
      queryText = firstMessage.content
        .map((c) => (typeof c === "string" ? c : ""))
        .join(" ");
    } else {
      queryText = "";
    }
  } else {
    queryText = "";
  }

  // Thread configuration
  const threadConfig = { configurable: { thread_id: threadId }, checkpointer };

  // Initial input for workflow
  const initialInput = {
    query: queryText,
    messages,
  };

  try {
    // Step 1: Run workflow until the first interrupt (askRankingCriteria)
    await workflow.invoke(initialInput, threadConfig);

    console.log("\n---WAITING FOR HUMAN INPUT---\n");

    // Step 2: Use ranking criteria (from UI or default to "Citations")
    const humanInput = rankingCriteria || "Citations";

    console.log(`Resuming workflow with human input: ${humanInput}\n`);

    const finalResult = await workflow.invoke(
      new Command({ resume: humanInput }),
      threadConfig
    );

    console.log("Workflow completed. Final state/results:");
    console.log(finalResult);

    return finalResult;
  } catch (err) {
    console.error("Error in runAgent:", err);
    throw err;
  }
}
