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
  // Default to the searched source stop name — use stop id for unique selection
  const defaultStop = stops.find(
    (s) => s.stop_name?.toLowerCase() === selectedBus?.source_stop?.toLowerCase()
  ) || null;

  const [selectedStopId, setSelectedStopId] = useState(
    defaultStop?.id ? String(defaultStop.id) : ""
  );

  if (!open) return null;

  const handleSubmit = () => {
    if (!selectedStopId) return;
    // Look up by unique stop id — not by name
    const stopObj = stops.find((s) => String(s.id) === selectedStopId);
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
              value={selectedStopId}
              onChange={(e) => setSelectedStopId(e.target.value)}
              className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Choose stop</option>
              {stops.map((stop) => (
                <option key={stop.id} value={String(stop.id)}>
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
            disabled={loading || !selectedStopId}
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
