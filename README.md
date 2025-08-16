## Research Agent

An autonomous research assistant that helps you explore scientific literature. Provide a query, and the agent retrieves papers, ranks them based on criteria, generates summaries, and highlights potential research gaps.

## Features

- 🔍 Search academic papers via OpenAlex

- 📊 Rank results by date, citation count, or semantic similarity

- 📝 Summarize papers for quick review

- 🧩 Identify gaps and suggest research opportunities

- 💬 Conversational interface for iterative refinement

## Tools Used

OpenAlex – Academic paper search

LangChain – Orchestration of LLMs

LangGraph – Workflow management

Next.js – Frontend and APIs

### Notes

To reduce token and API usage, the agent processes limited paper content (titles, abstracts, metadata) while still providing useful rankings and gap analysis. This design can easily be extended for deeper analysis using full papers.