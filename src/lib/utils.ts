import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.3,
  apiKey: process.env.GROQ_API_KEY,
});

export type OpenAlexPaper = {
  title: string;
  authors: string[];
  published_date?: string;
  abstract: string;
  cited_by_count: number;
  relevance_score?: number;
};

type OpenAlexAPIResult = {
  title: string;
  authorships?: { author: { display_name: string } }[];
  publication_date?: string;
  abstract_inverted_index?: Record<string, number[]>;
  cited_by_count?: number;
  relevance_score?: number;
};

export async function openAlexSearch(
  query: string,
  maxResults: number
): Promise<OpenAlexPaper[]> {
  const url = "https://api.openalex.org/works";
  const params = new URLSearchParams({
    search: query,
    "per-page": maxResults.toString(),
    sort: "relevance_score:desc",
  });

  try {
    const res = await fetch(`${url}?${params.toString()}`);
    if (!res.ok) throw new Error(`OpenAlex request failed: ${res.statusText}`);
    const data = await res.json();

    return data.results.map((result: OpenAlexAPIResult) => {
      // Reconstruct abstract from abstract_inverted_index if available
      const abstractInverted = result.abstract_inverted_index ?? {};
      const abstract = Object.entries(abstractInverted)
        .flatMap(([word, positions]) =>
          Array.isArray(positions) ? positions.map(() => word) : []
        )
        .join(" ");

      return {
        title: result.title,
        authors: Array.isArray(result.authorships)
          ? result.authorships.map(
              (a: { author: { display_name: string } }) => a.author.display_name
            )
          : [],
        published_date: result.publication_date,
        abstract: abstract || "",
        cited_by_count: result.cited_by_count || 0,
        relevance_score: result.relevance_score || 0,
      };
    });
  } catch (err) {
    console.error(err);
    return [];
  }
}

const OpenAlexToolSchema = z.object({
  query: z.string().describe("Research query or topic."),
});

export const OpenAlexTool = tool(
  async (input: unknown) => {
    const { query } = OpenAlexToolSchema.parse(input);
    const papers: OpenAlexPaper[] = await openAlexSearch(query, 5);
    return papers;
  },
  {
    name: "openalex_search",
    description: "Retrieve research papers from OpenAlex.",
    schema: OpenAlexToolSchema,
  }
);
