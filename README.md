## Research Agent

An autonomous research assistant that helps you explore scientific literature. Provide a query, and the agent retrieves papers, ranks them based on criteria, generates summaries, and highlights potential research gaps.

**Live Demo:** [research-copilot-five.vercel.app](https://research-copilot-five.vercel.app/)

## Features

- 🔍 Search academic papers via OpenAlex

- 📊 Rank results by date, citation count, or semantic similarity (human-in-the-loop)

- 📝 Summarize papers for quick review

- 🧩 Identify gaps and suggest research opportunities

- 💬 Conversational interface for iterative refinement

## Tools Used

**OpenAlex** – For searching and retrieving relevant academic papers efficiently. 

**LangChain** – Orchestrates the LLMs, manages multi-step reasoning, and integrates with external tools.

**LangGraph** – Manages workflow states, human-in-the-loop decisions, and interruptions like ranking criteria.

**Next.js** – Provides a responsive frontend and robust API routes for smooth user interactions. 

**Groq / LLaMA 3.3 70B Versatile** – The large language model powering paper summarization, ranking, and research gap analysis.  

### Notes

To reduce token and API usage, the agent processes limited paper content (titles, abstracts, metadata) while still providing useful rankings and gap analysis. This design can easily be extended for deeper analysis using full papers.