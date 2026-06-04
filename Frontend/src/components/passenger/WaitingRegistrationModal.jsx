import { useState } from "react";

export default function WaitingRegistrationModal({
  open,
  onClose,
  selectedBus,
  route,           // from getPassengerRoute — has: id, route_name, source, destination, stops[]
  stops = [],      // route.stops — each: { id, stop_name, stop_order }
  onSubmit,        // receives the full stop object { id, stop_name, stop_order }
  loading,
}) {
  // Default to the searched source stop name
  const defaultStop = stops.find(
    (s) => s.stop_name?.toLowerCase() === selectedBus?.source_stop?.toLowerCase()
  ) || null;

  const [selectedStop, setSelectedStop] = useState(defaultStop?.stop_name || "");

  if (!open) return null;

  const handleSubmit = () => {
    if (!selectedStop) return;
    // Pass the full stop object — caller needs stop.id to call the API
    const stopObj = stops.find((s) => s.stop_name === selectedStop);
    if (!stopObj) return;
    onSubmit(stopObj);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
        <div className="mb-5">
          <h2 className="text-xl font-bold">Register Waiting</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Notify the driver that you're waiting.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-700">
            <p className="text-sm text-zinc-500">Route</p>
            {/* getPassengerRoute returns source/destination — not source_stop/destination_stop */}
            <p className="font-semibold">
              {route?.source} → {route?.destination}
            </p>

            <div className="mt-3">
              <p className="text-sm text-zinc-500">Bus</p>
              <p className="font-semibold">{selectedBus?.bus_number}</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Select Boarding Stop
            </label>

            <select
              value={selectedStop}
              onChange={(e) => setSelectedStop(e.target.value)}
              className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Choose stop</option>
              {stops.map((stop) => (
                // key uses stop.id (unique DB id), value uses stop_name for matching
                <option key={stop.id} value={stop.stop_name}>
                  {stop.stop_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-zinc-300 px-4 py-3 font-medium dark:border-zinc-700"
          >
            Cancel
          </button>

          <button
            disabled={loading || !selectedStop}
            onClick={handleSubmit}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Registering..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
