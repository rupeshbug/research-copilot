import { Sparkles } from "lucide-react";
import Chat from "../../components/Chat";

export default function DashboardPage() {
  return (
    <main className="min-h-screen  text-center flex flex-col bg-gray-50">
      <header className="p-6 border-b bg-white shadow-sm">
        <div className="text-2xl font-semibold text-gray-900 flex items-center justify-center gap-2">
          <Sparkles className="text-yellow-500" />
          <h1>Research Copilot</h1>
        </div>
        <p className="text-md text-gray-600 mt-2">
          Ask a research question and explore results
        </p>
      </header>

      {/* Chat area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Chat />
      </div>
    </main>
  );
}
