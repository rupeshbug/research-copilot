import { NextResponse } from "next/server";
import { openAlexSearch } from "@/lib/utils";

export async function GET() {
  const response = await openAlexSearch("Graph Neural Networks", 2);
  return NextResponse.json({ response });
}
