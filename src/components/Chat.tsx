export default function Chat() {
  return (
    <div className="flex flex-col w-full max-w-3xl h-[80vh] bg-white shadow-md rounded-2xl overflow-hidden">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Example messages */}
        <div className="mr-auto max-w-[75%] px-4 py-2 rounded-2xl bg-gray-100 text-gray-900">
          Hello! I am your research assistant.
        </div>
        <div className="ml-auto max-w-[75%] px-4 py-2 rounded-2xl bg-gray-900 text-white">
          Great! Can you help me find papers on climate models?
        </div>
      </div>

      {/* Input area */}
      <div className="p-4 border-t flex items-center gap-2">
        <input
          type="text"
          placeholder="Ask about research papers..."
          className="flex-1 rounded-xl text-gray-700 border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button className="px-4 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition">
          Send
        </button>
      </div>
    </div>
  );
}
