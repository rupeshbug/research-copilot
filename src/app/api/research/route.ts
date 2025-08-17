import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "../../../lib/agentRunner";
import { HumanMessage } from "@langchain/core/messages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log(body);
    const { query, rankingCriteria, threadId = "session_1" } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required." },
        { status: 400 }
      );
    }

    // Wrap user input as a HumanMessage
    const initialMessage = new HumanMessage(query);

    // Call runAgent with proper parameters
    const result = await runAgent({
      messages: [initialMessage],
      rankingCriteria,
      threadId,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("Error in /api/research:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
