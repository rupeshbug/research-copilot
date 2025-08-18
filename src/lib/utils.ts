import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const llm = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0.3,
  apiKey: process.env.GROQ_API_KEY,
});

export interface OpenAlexPaper {
  title: string;
  authors: string[];
  published_date?: string;
  abstract: string;
  cited_by_count: number;
  relevance_score?: number;
}

interface OpenAlexAPIResult {
  title: string;
  authorships?: Array<{ author: { display_name: string } }>;
  publication_date?: string;
  abstract_inverted_index?: Record<string, number[]>;
  cited_by_count?: number;
  relevance_score?: number;
}

interface OpenAlexAPIResponse {
  results: OpenAlexAPIResult[];
}

export async function openAlexSearch(
  query: string,
  maxResults: number = 5
): Promise<OpenAlexPaper[]> {
  const url = "https://api.openalex.org/works";
  const params = new URLSearchParams({
    search: query,
    "per-page": maxResults.toString(),
    sort: "relevance_score:desc",
  });

  try {
    const res = await fetch(`${url}?${params.toString()}`);

    if (!res.ok) {
      throw new Error(
        `OpenAlex request failed: ${res.status} ${res.statusText}`
      );
    }

    const data: OpenAlexAPIResponse = await res.json();

    if (!data.results || data.results.length === 0) {
      console.log("No papers found for query:", query);
      return [];
    }

    return data.results.map((result: OpenAlexAPIResult): OpenAlexPaper => {
      // Reconstruct abstract from abstract_inverted_index if available
      let abstract = "";

      if (
        result.abstract_inverted_index &&
        Object.keys(result.abstract_inverted_index).length > 0
      ) {
        // Create word-position pairs and sort them
        const wordPositions: Array<{ word: string; position: number }> = [];

        Object.entries(result.abstract_inverted_index).forEach(
          ([word, positions]) => {
            if (Array.isArray(positions)) {
              positions.forEach((position) => {
                wordPositions.push({ word, position });
              });
            }
          }
        );

        // Sort by position and reconstruct
        abstract = wordPositions
          .sort((a, b) => a.position - b.position)
          .map((item) => item.word)
          .join(" ");

        // Clean up common issues with reconstructed text
        abstract = abstract
          .replace(/\s+/g, " ") // Replace multiple spaces with single space
          .replace(/\s+([.,;:!?])/g, "$1") // Remove spaces before punctuation
          .trim();
      }

      // Extract authors safely
      const authors = result.authorships
        ? result.authorships
            .map((authorship) => authorship?.author?.display_name)
            .filter((name): name is string => typeof name === "string")
        : [];

      return {
        title: result.title || "Untitled",
        authors,
        published_date: result.publication_date,
        abstract: abstract || "No abstract available",
        cited_by_count: result.cited_by_count || 0,
        relevance_score: result.relevance_score || 0,
      };
    });
  } catch (error) {
    console.error("Error in openAlexSearch:", error);
    return [];
  }
}

const OpenAlexToolSchema = z.object({
  query: z
    .string()
    .describe("Research query or topic for finding academic papers."),
});

export const OpenAlexTool = tool(
  async (input: unknown): Promise<OpenAlexPaper[]> => {
    const parsed = OpenAlexToolSchema.parse(input);
    const { query } = parsed;
    console.log(`Searching OpenAlex for: ${query}`);

    const papers = await openAlexSearch(query, 5);

    console.log(`Found ${papers.length} papers`);
    return papers;
  },
  {
    name: "openalex_search",
    description:
      "Search for academic research papers using OpenAlex database. Use this when users ask about research papers, studies, or academic literature on specific topics.",
    schema: OpenAlexToolSchema,
  }
);
