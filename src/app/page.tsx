import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white/90 to-gray-50/60 relative">
      {/* Background grid */}
      <div className="absolute inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:6rem_4rem] opacity-70" />

      <section className="w-full max-w-5xl mx-auto px-6 py-12 text-center space-y-12">
        {/* Hero */}
        <header className="space-y-6">
          <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
            Research Assistant
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
            Discover, rank, and analyze academic papers with AI. Your personal
            research co-pilot.
          </p>
        </header>

        {/* CTA */}
        <Link href="/dashboard">
          <button className="group inline-flex cursor-pointer items-center px-8 py-4 text-lg font-semibold rounded-2xl text-white bg-gradient-to-r from-gray-900 to-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            Get Started
            <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </button>
        </Link>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
          {[
            {
              title: "Discover",
              description: "Search academic papers with OpenAlex",
            },
            {
              title: "Analyze",
              description: "Rank, summarize, and detect research gaps",
            },
            {
              title: "Iterate",
              description: "Refine with conversational feedback",
            },
          ].map(({ title, description }) => (
            <div
              key={title}
              className="p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-gray-200 hover:shadow-md hover:-translate-y-1 transition-all"
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-600">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
