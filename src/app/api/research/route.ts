import { NextResponse } from "next/server";
import { workflow, AgentState } from "@/lib/agent";
import { HumanMessage } from "@langchain/core/messages";

export async function POST(req: Request) {
  const body = await req.json();
  const userMessage = body.message;

  if (!userMessage) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  console.log("Incoming user message from API:", userMessage);

  // Initialize state properly
  const state: AgentState = {
    query: userMessage,
    papers: [],
    rankingCriteria: "",
    rankedPapers: [],
    gaps: "",
    messages: [new HumanMessage({ content: userMessage })],
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
