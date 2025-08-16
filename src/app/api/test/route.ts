import { llm } from "@/lib/utils";
import { NextResponse } from "next/server";

export async function GET() {
  const response = await llm.invoke("Define AI in a single sentence.");
  return NextResponse.json({ content: response.content });
}
