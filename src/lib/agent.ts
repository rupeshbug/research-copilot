import { BaseMessage } from "@langchain/core/messages";
import { OpenAlexPaper, llm, OpenAlexTool } from "./utils";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { interrupt, MemorySaver } from "@langchain/langgraph";

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
  console.log("Call Model Node");

  // Add system message for tool decision
  const systemPrompt = new SystemMessage(`You are a helpful research assistant. 
  
If the user asks about research papers, academic topics, or wants to find scientific literature, use the openalex_search tool.
Examples of research queries: "papers on neural networks", "research about machine learning", "studies on climate change"

For general conversation, greetings, or follow-up questions about already retrieved papers, respond normally without using tools.`);

  const messagesWithSystem = [systemPrompt, ...state.messages];
  const response = await llmWithTool.invoke(messagesWithSystem);
  console.log("LLM response from callModel node:", response);

  return { messages: [response] };
}

// Node: Load papers
async function loadPapers(state: AgentState): Promise<Partial<AgentState>> {
  console.log("---LOAD PAPERS NODE---");

  // Find the last tool message in the message history
  const lastToolMessage = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "tool");

  if (!lastToolMessage) {
    console.log("No tool message found in state. Skipping loadPapers node.");
    return { papers: [] };
  }

  // The content of the ToolMessage should be the array of papers
  const papers = lastToolMessage.content as OpenAlexPaper[];

  if (!papers || papers.length === 0) {
    console.log("Tool returned no papers. Skipping loadPapers node.");
    return { papers: [] };
  }

  console.log(
    "Found papers:",
    papers.map((p) => p.title)
  );

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
  console.log("---INTERRUPT: ASK RANKING CRITERIA---");

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
  console.log("---RANKING PAPERS NODE---");

  if (!state.papers || state.papers.length === 0) {
    console.log("No papers to rank");
    return { rankedPapers: [] };
  }

  let criteria = state.rankingCriteria?.trim().toLowerCase() || "citations";
  const validCriteria = ["citations", "recency", "relevance"];

  if (!validCriteria.includes(criteria)) {
    console.log("Invalid criteria. Defaulting to 'citations'.");
    criteria = "citations";
  }

  console.log(`Ranking by: ${criteria}`);

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
  console.log(
    "Top 3 ranked papers:",
    topPapers.map((p) => p.title)
  );

  return { rankedPapers: topPapers };
}

// Node: Gap analysis
async function gapAnalysis(state: AgentState): Promise<Partial<AgentState>> {
  console.log("---PERFORMING GAP ANALYSIS---");

  if (!state.rankedPapers || state.rankedPapers.length === 0) {
    console.log("No ranked papers. Skipping gap analysis.");
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
    console.log("Gap analysis completed");
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
  console.log("---CONVERSATIONAL NODE---");

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
  const messagesForLLM = state.messages.filter((msg) => {
    return (
      msg.content &&
      typeof msg.content === "string" &&
      msg.content.trim().length > 0
    );
  });

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
    console.log("Routing to tools");
    return "tools";
  }

  console.log("Routing to conversation");
  return "conversationalNode";
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
  .addConditionalEdges("callModel", shouldUseTools)

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
