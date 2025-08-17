import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "../../../lib/agentRunner";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log(body);
    const query = body.query;
    const rankingCriteria = body.rankingCriteria;
    const threadId = body.threadId || "session_1";

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required." },
        { status: 400 }
      );
    }

    // Call runAgent with all parameters
    const result = await runAgent({ query, rankingCriteria, threadId });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("Error in /api/research:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
