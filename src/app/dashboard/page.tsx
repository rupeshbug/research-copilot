import Chat from "../../components/Chat";

export default function DashboardPage() {
  return (
    <main className="min-h-screen flex flex-col bg-gray-50">
      {/* Header (can be extracted to DashboardLayout if needed) */}
      <header className="p-6 border-b bg-white shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-600">
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
