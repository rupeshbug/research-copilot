import { BaseMessage } from "@langchain/core/messages";
import { OpenAlexPaper, llm, OpenAlexTool } from "./utils";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";

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

// Node: Call Nodel
async function callModel(state: AgentState) {
  console.log("Call Model NOde");
  const response = await llmWithTool.invoke(state.messages);
  console.log("LLM response from callModel node:", response);
  return { messages: [response] };
}

// Node: Load papers
async function loadPapers(state: AgentState) {
  const lastToolCall = state.messages[state.messages.length - 1] as AIMessage;
  const query = lastToolCall.tool_calls?.[0]?.args?.query as string;
  console.log("query from load papers node: ", query);

  if (!query) return {};

  console.log("---LOAD PAPERS NODE--- Query:", query);
  const papers = await OpenAlexTool.invoke({ query });
  console.log(
    "Loaded papers:",
    papers.map((p) => p.title)
  );

  return { papers, query };
}

// Node: Rank papers
async function rankPapers(state: AgentState) {
  if (!state.papers || state.papers.length === 0) {
    console.log("No papers to rank.");
    return { rankedPapers: [], rankingCriteria: "citations" };
  }

  // Determine ranking criteria from user input or default
  const validCriteria = ["relevance", "recency", "citations"];
  let criteria = state.rankingCriteria?.trim().toLowerCase();
  if (!criteria || !validCriteria.includes(criteria)) {
    console.log(
      "User did not provide valid ranking criteria. Defaulting to 'citations'."
    );
    criteria = "citations";
  }

  // Sort papers based on the chosen criteria
  let ranked: OpenAlexPaper[] = [];
  if (criteria === "relevance") {
    ranked = state.papers
      .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
      .slice(0, 3);
  } else if (criteria === "recency") {
    ranked = state.papers
      .sort(
        (a, b) =>
          new Date(b.published_date ?? 0).getTime() -
          new Date(a.published_date ?? 0).getTime()
      )
      .slice(0, 3);
  } else {
    // Default or citations
    ranked = state.papers
      .sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
      .slice(0, 3);
  }

  console.log("Ranking criteria:", criteria);
  console.log(
    "Top 3 ranked papers:",
    ranked.map((p) => p.title)
  );

  return { rankedPapers: ranked, rankingCriteria: criteria };
}

// Node: Gap analysis
async function gapAnalysis(state: AgentState) {
  console.log("---PERFORMING GAP ANALYSIS---");

  // Prepare paper summaries text for prompt
  const papersText = state.rankedPapers
    .map(
      (p, i) => `Paper ${i + 1}:\nTitle: ${p.title}\nSummary: ${p.abstract}\n`
    )
    .join("\n");

  const prompt = `You are a research assistant. 
    Analyze the top 3 papers below and identify potential research gaps or limitations for each. 
    Be specific, constructive, and realistic using only the provided summaries. As you are provided only
    summaries, provide simple enough answers.

    Query: ${state.query}

    Papers and Summaries:
    ${papersText}

    Provide a clear, numbered list for each paper.`;

  const response = await llm.invoke(prompt);

  // Type-safe access
  const gaps = (response.content as string) || "No gaps identified";
  return { gaps: gaps };
}

// Node: Conversational Node
async function conversationalNode(state: AgentState) {
  console.log("Conversational Node");
  const papersText = state.rankedPapers
    .map(
      (p, i) => `Paper ${i + 1}:\nTitle: ${p.title}\nSummary: ${p.abstract}\n`
    )
    .join("\n");

  const gapsText = state.gaps || "No gaps identified yet.";

  const SYSTEM_TEMPLATE = `
    You are a research assistant.
    The user asked: ${state.query}

    Top-ranked papers with summaries:
    ${papersText}

    Identified gaps in each paper:
    ${gapsText}

    Provide a helpful response to the user.
  `;

  const pastMessages = state.messages;

  const response = await llm.invoke([
    { role: "system", content: SYSTEM_TEMPLATE },
    ...pastMessages,
  ]);

  const reply = (response.content as string) || "No response from model";
  console.log("Agent Reply conversational node", reply);

  return {
    messages: [...state.messages, new AIMessage({ content: reply })],
  };
}

const graph = new StateGraph(AgentStateAnnotation)
  // Nodes
  .addNode("callModel", callModel)
  .addNode("tools", toolNode)
  .addNode("loadPapers", loadPapers)
  .addNode("rankPapers", rankPapers)
  .addNode("gapAnalysis", gapAnalysis)
  .addNode("conversationalNode", conversationalNode)
  // Start
  .addEdge(START, "callModel")
  // Conditional edge from model: decide tool or conversation
  .addConditionalEdges("callModel", (state) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (lastMessage.tool_calls?.length) return "tools";
    return "conversationalNode";
  })
  .addEdge("tools", "loadPapers")
  .addEdge("loadPapers", "rankPapers")
  .addEdge("rankPapers", "gapAnalysis")
  .addEdge("gapAnalysis", "conversationalNode")
  .addEdge("conversationalNode", END);

export const workflow = graph.compile();
