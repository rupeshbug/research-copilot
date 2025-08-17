import { NextResponse } from "next/server";
import { workflow, AgentState } from "@/lib/agent";
import { AIMessage } from "@langchain/core/messages";

export async function POST(req: Request) {
  const body = await req.json();
  const userMessage = body.message;

  // Initialize state properly
  const state: AgentState = {
    query: userMessage,
    papers: [],
    rankingCriteria: "",
    rankedPapers: [],
    gaps: "",
    messages: [new AIMessage({ content: userMessage })],
  };

  // Run the workflow
  const result = await workflow.invoke(state);

  return NextResponse.json({
    messages: result.messages.map((m) => m.content),
    papers: result.papers,
    rankedPapers: result.rankedPapers,
    gaps: result.gaps,
    rankingCriteria: result.rankingCriteria,
  });
}
