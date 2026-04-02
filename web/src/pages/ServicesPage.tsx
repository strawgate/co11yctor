import type { FunctionComponent } from "preact";
import { fetchServices } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";

export const ServicesPage: FunctionComponent = () => {
  const { data: services, isLoading } = useQuery(() => fetchServices(), [], {
    refetchInterval: 15000,
  });

  return (
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Services</h1>
        <span class="text-sm text-slate-500">
          {services?.length ?? 0} services discovered
        </span>
      </div>

      {/* Service Map placeholder */}
      <div class="bg-slate-900 rounded-lg border border-slate-800 p-8">
        <div class="text-center">
          <div class="text-4xl mb-4">🗺️</div>
          <h2 class="text-lg font-semibold text-slate-300 mb-2">Service Map</h2>
          <p class="text-sm text-slate-500 max-w-md mx-auto">
            The service map shows dependencies between your services based on trace data.
            As more traces are captured, the map will automatically populate.
          </p>
        </div>
      </div>

      {/* Service Grid */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <div class="col-span-full text-center text-slate-500 py-8">Loading services…</div>
        ) : !services?.length ? (
          <div class="col-span-full text-center text-slate-500 py-8">
            No services discovered yet. Waiting for telemetry data…
          </div>
        ) : (
          services.map((name) => (
            <div
              key={name}
              class="bg-slate-900 rounded-lg border border-slate-800 p-4 hover:border-indigo-500/50 transition-colors"
            >
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div class="text-sm font-semibold text-slate-200">{name}</div>
                  <div class="text-xs text-slate-500">Service</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
