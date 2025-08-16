import { NextRequest, NextResponse } from "next/server";
import { workflow } from "@/lib/agent";

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  const result = await workflow.invoke({ query: query });

  return NextResponse.json(result);
}
