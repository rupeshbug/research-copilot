import { BaseMessage } from "@langchain/core/messages";
import { OpenAlexPaper, llm, OpenAlexTool } from "./utils";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";

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
  console.log("Call Model Node");
  const response = await llmWithTool.invoke(state.messages);
  console.log("LLM response from callModel node:", response);
  return { messages: [response] };
}

// Node: Load papers
async function loadPapers(state: AgentState) {
  // Find the last tool message in the message history
  const lastToolMessage = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "tool");

  if (!lastToolMessage) {
    console.log("No tool message found in state. Skipping loadPapers node.");
    return {};
  }

  // The content of the ToolMessage is the output of the tool, which should be the array of papers
  const papers = lastToolMessage.content as OpenAlexPaper[];

  if (!papers || papers.length === 0) {
    console.log("Tool returned no papers. Skipping loadPapers node.");
    return { papers: [] };
  }

  console.log(
    "---LOAD PAPERS NODE--- Found papers:",
    papers.map((p) => p.title)
  );

  return { papers };
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
  if (!state.rankedPapers || state.rankedPapers.length === 0) {
    console.log("No ranked papers. Skipping gap analysis.");
    return { gaps: "No gaps identified" };
  }

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

  let systemTemplate = `
        You are a helpful research assistant.
        The user's query was: "${state.query || "a general question"}"

        Your role:
        - Answer the user's questions conversationally.
        - If no research context is available, respond to the user's original message directly.
        - If the user wants to refine the search, suggest next steps.
    `;

  // Only add the research context if papers were found and ranked
  if (state.rankedPapers && state.rankedPapers.length > 0) {
    systemTemplate += `
            Top-ranked papers with summaries:
            ${papersText}

            Identified gaps in each paper:
            ${gapsText}

            - Use the provided context to support your answers.
        `;
  }

  // Filter out messages with tool calls that have no string content
  const messagesForLLM = state.messages.filter((msg) => {
    return typeof msg.content === "string" && msg.content.length > 0;
  });

  const response = await llm.invoke([
    new SystemMessage(systemTemplate),
    ...messagesForLLM,
  ]);

  return {
    messages: [response],
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
