import { BaseMessage } from "@langchain/core/messages";
import { openAlexSearch, OpenAlexPaper, llm } from "./utils";
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  addMessages,
  Annotation,
} from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

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

// Node 1: Load papers
async function loadPapers(state: AgentState) {
  const query = state["query"];
  const papers = await openAlexSearch(query, 3);
  console.log(
    "Loaded papers:",
    papers.map((p) => p.title)
  );
  return { papers: papers };
}

// Node 2: Rank papers
async function rankPapers(state: AgentState) {
  if (!state.papers || state.papers.length === 0) {
    console.log("No papers to rank.");
    return { rankedPapers: [] };
  }

  let criteria = state.rankingCriteria;
  if (!criteria) {
    const titles = state.papers.map((p) => p.title).join("\n");
    const prompt = `
      You are a research assistant. Given the following papers:

      ${titles}

      Decide how to rank the top 3 papers based on relevance to the query.
      Options: "relevance" (semantic similarity), "citations" (impact), "recency" (publication date).
      If the input is unclear, default to citations.
      Respond with just one word: relevance, citations, or recency.
      `;

    const response = await llm.invoke(prompt);
    criteria =
      (response.content as string)?.trim().toLowerCase() || "citations";
    console.log("Ranking criteria decided by model:", criteria);
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
    // Default: citations
    ranked = state.papers
      .sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
      .slice(0, 3);
  }

  state.rankedPapers = ranked;
  console.log(
    "Top 3 ranked papers:",
    ranked.map((p) => p.title)
  );
  return { rankedPapers: ranked };
}

// Node 3: Gap analysis
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

// Node 4: Conversational Node
async function conversationalNode(state: AgentState) {
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

    Provide a helpful response to the user, guiding them or answering questions based on this context. 
    You may ask follow-up questions or suggest refinements naturally as part of the conversation.
  `;

  const pastMessages = state.messages;

  const response = await llm.invoke([
    { role: "system", content: SYSTEM_TEMPLATE },
    ...pastMessages,
  ]);

  const reply = (response.content as string) || "No response from model";

  return {
    messages: [...state.messages, new AIMessage({ content: reply })],
  };
}

const graph = new StateGraph(AgentStateAnnotation)
  .addNode("loadPapers", loadPapers)
  .addNode("rankPapers", rankPapers)
  .addNode("gapAnalysis", gapAnalysis)
  .addNode("conversationalNode", conversationalNode)
  .addEdge(START, "loadPapers")
  .addEdge("loadPapers", "rankPapers")
  .addEdge("rankPapers", "gapAnalysis")
  .addEdge("gapAnalysis", "conversationalNode")
  .addEdge("conversationalNode", END);

export const workflow = graph.compile();
