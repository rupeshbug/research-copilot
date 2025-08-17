import { workflow } from "./agent";
import { MemorySaver, Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";

// Create an in-memory checkpointer
const checkpointer = new MemorySaver();

/**
 * Run the agent workflow with provided parameters
 * @param query User query string
 * @param rankingCriteria Optional ranking criteria for papers
 * @param threadId Unique session/thread ID
 * @returns Final workflow result
 */
export async function runAgent({
  query,
  rankingCriteria,
  threadId,
}: {
  query: string;
  rankingCriteria?: string;
  threadId: string;
}) {
  if (!query || typeof query !== "string") {
    throw new Error("Query is required.");
  }

  // Initial messages must have at least one item
  const initialInput = {
    query,
    messages: [new HumanMessage(query)],
  };

  const threadConfig = { configurable: { thread_id: threadId }, checkpointer };

  // Step 1: Run workflow until first interrupt (askRankingCriteria)
  await workflow.invoke(initialInput, threadConfig);

  // Step 2: Resume workflow with human input
  const humanInput = rankingCriteria || "Citations";

  const result = await workflow.invoke(
    new Command({ resume: humanInput }),
    threadConfig
  );

  return result;
}
