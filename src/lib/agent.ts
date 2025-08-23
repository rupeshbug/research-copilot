import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { OpenAlexPaper, llm, OpenAlexTool } from "./utils";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { interrupt, MemorySaver } from "@langchain/langgraph";

// Helper function to ensure message content is string
function ensureStringContent(message: BaseMessage): BaseMessage {
  if (typeof message.content === "string") {
    return message;
  }

  // Convert non-string content to string
  const stringContent =
    typeof message.content === "object"
      ? JSON.stringify(message.content)
      : String(message.content);

  // Create new message with string content
  const messageType = message.getType();
  switch (messageType) {
    case "human":
      return new HumanMessage({ content: stringContent });
    case "ai":
      return new AIMessage({ content: stringContent });
    case "system":
      return new SystemMessage({ content: stringContent });
    default:
      return new AIMessage({ content: stringContent });
  }
}

// Agent State
const AgentStateAnnotation = Annotation.Root({
  query: Annotation<string>(),
  papers: Annotation<OpenAlexPaper[]>(),
  rankingCriteria: Annotation<string>(),
  rankedPapers: Annotation<OpenAlexPaper[]>(),
  gaps: Annotation<string>(),
  messages: Annotation<BaseMessage[]>({
    reducer: (currentState, updateValue) => currentState.concat(updateValue),
    default: () => [],
  }),
});

export type AgentState = typeof AgentStateAnnotation.State;

// Tools
const tools = [OpenAlexTool];
const toolNode = new ToolNode(tools);
const llmWithTool = llm.bindTools(tools);

// Node: Call Model
async function callModel(state: AgentState): Promise<Partial<AgentState>> {
  // Add system message for tool decision
  const systemPrompt = new SystemMessage(`You are a Research Agent. 
    When the user asks about research, papers, studies, or academic topics, 
    you MUST call the "openalex_search" tool with their query. 
    Do not answer directly without searching. 
    If the query is not research-related, then you may respond normally. 
    Always prefer tool use first for anything academic. `);

  // Ensure all messages have string content
  const cleanedMessages = state.messages.map(ensureStringContent);

  const messagesWithSystem = [systemPrompt, ...cleanedMessages];
  const response = await llmWithTool.invoke(messagesWithSystem);

  return { messages: [response] };
}

// Node: Load papers
async function loadPapers(state: AgentState): Promise<Partial<AgentState>> {
  // Find the last tool message in the message history
  const lastToolMessage = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "tool");

  if (!lastToolMessage) {
    return { papers: [] };
  }

  // The content of the ToolMessage should be the array of papers
  const papers = lastToolMessage.content as OpenAlexPaper[];

  if (!papers || papers.length === 0) {
    return { papers: [] };
  }

  // Extract query from the last human message for context
  const lastHumanMessage = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "human");

  const query = lastHumanMessage?.content?.toString() || "";

  return { papers, query };
}

// Node: Human-in-the-Loop Node for asking criteria
async function askRankingCriteria(
  state: AgentState
): Promise<Partial<AgentState>> {
  const papersPreview = state.papers
    .map((p, i) => `${i + 1}. ${p.title}`)
    .join("\n");

  const rankingCriteria = interrupt({
    papers_found: papersPreview,
    message: `We found ${state.papers.length} papers. How would you like to rank the top 3?`,
    options: ["citations", "recency", "relevance"],
  }) as string;

  return { rankingCriteria };
}

// Node: Rank papers
async function rankPapers(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.papers || state.papers.length === 0) {
    return { rankedPapers: [] };
  }

  let criteria = state.rankingCriteria?.trim().toLowerCase() || "citations";
  const validCriteria = ["citations", "recency", "relevance"];

  if (!validCriteria.includes(criteria)) {
    criteria = "citations";
  }

  const rankedPapers = [...state.papers].sort((a, b) => {
    if (criteria === "citations") {
      return (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0);
    }
    if (criteria === "recency") {
      const dateA = a.published_date ? new Date(a.published_date).getTime() : 0;
      const dateB = b.published_date ? new Date(b.published_date).getTime() : 0;
      return dateB - dateA;
    }
    if (criteria === "relevance") {
      return (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
    }
    return 0;
  });

  const topPapers = rankedPapers.slice(0, 3);

  return { rankedPapers: topPapers };
}

// Node: Gap analysis
async function gapAnalysis(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.rankedPapers || state.rankedPapers.length === 0) {
    return { gaps: "No gaps identified - no papers were ranked." };
  }

  // Prepare paper summaries text for prompt
  const papersText = state.rankedPapers
    .map(
      (p, i) =>
        `Paper ${i + 1}:\nTitle: ${p.title}\nAuthors: ${p.authors.join(
          ", "
        )}\nAbstract: ${p.abstract}\n`
    )
    .join("\n");

  const prompt = `You are a research assistant. Analyze the top 3 papers below and identify potential research gaps or limitations for each paper individually. Be specific, constructive, and realistic using only the provided abstracts. Keep your analysis concise since you only have abstracts to work with.

Query: ${state.query || "research papers"}

Papers and Summaries:
${papersText}

Provide a clear, numbered analysis for each paper focusing on What gaps or limitations you can identify. Make it short and clear.

Format your response as:
Paper 1: [Analysis]
Paper 2: [Analysis] 
Paper 3: [Analysis]`;

  try {
    const response = await llm.invoke(prompt);
    const gaps = (response.content as string) || "No gaps identified";
    return { gaps };
  } catch (error) {
    console.error("Error in gap analysis:", error);
    return { gaps: "Error occurred during gap analysis" };
  }
}

// Node: Conversational Node
async function conversationalNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  // Build context based on available research data
  let contextInfo = "";

  if (state.rankedPapers && state.rankedPapers.length > 0) {
    const papersText = state.rankedPapers
      .map((p, i) => `${i + 1}. ${p.title} - ${p.abstract.slice(0, 200)}...`)
      .join("\n\n");

    contextInfo += `\n\nRESEARCH CONTEXT:
Top-ranked papers (by ${state.rankingCriteria || "citations"}):
${papersText}`;

    if (state.gaps) {
      contextInfo += `\n\nIDENTIFIED RESEARCH GAPS:
${state.gaps}`;
    }
  }

  const systemTemplate = `You are a helpful research assistant. 

${contextInfo}

Instructions:
- Answer the user's questions conversationally and helpfully
- If research context is available, use it to provide informed responses
- If the user asks for more research, suggest they can ask for papers on specific topics
- Be concise but informative
- If no research context is available, respond to their message directly`;

  // Filter messages to only include content that can be processed
  const messagesForLLM = state.messages
    .filter((msg) => {
      const content =
        typeof msg.content === "string" ? msg.content : String(msg.content);
      return content && content.trim().length > 0;
    })
    .map(ensureStringContent);

  try {
    const response = await llm.invoke([
      new SystemMessage(systemTemplate),
      ...messagesForLLM,
    ]);

    return { messages: [response] };
  } catch (error) {
    console.error("Error in conversational node:", error);
    return {
      messages: [
        new AIMessage({
          content:
            "I apologize, but I encountered an error processing your request. Please try again.",
        }),
      ],
    };
  }
}

// Conditional routing function
function shouldUseTools(state: AgentState): string {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }
  return "end";
}

// Build the graph
const graph = new StateGraph(AgentStateAnnotation)
  // Nodes
  .addNode("callModel", callModel)
  .addNode("tools", toolNode)
  .addNode("loadPapers", loadPapers)
  .addNode("askRankingCriteria", askRankingCriteria)
  .addNode("rankPapers", rankPapers)
  .addNode("gapAnalysis", gapAnalysis)
  .addNode("conversationalNode", conversationalNode)

  // Edges
  .addEdge(START, "callModel")

  // Conditional edge from model: decide tool or conversation
  .addConditionalEdges("callModel", shouldUseTools, {
    tools: "tools",
    end: END,
  })

  // Research workflow edges
  .addEdge("tools", "loadPapers")
  .addEdge("loadPapers", "askRankingCriteria")
  .addEdge("askRankingCriteria", "rankPapers")
  .addEdge("rankPapers", "gapAnalysis")
  .addEdge("gapAnalysis", "conversationalNode")

  // End
  .addEdge("conversationalNode", END);

const checkpointer = new MemorySaver();

export const workflow = graph.compile({
  checkpointer,
  interruptBefore: ["askRankingCriteria"],
});
