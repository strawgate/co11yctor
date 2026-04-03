import type { FunctionComponent } from "preact";
import { fetchServiceMap, fetchServices } from "@/lib/api";
import { useQuery } from "@/hooks/useQuery";

export const ServicesPage: FunctionComponent = () => {
  const { data: services, isLoading } = useQuery(() => fetchServices(), [], {
    refetchInterval: 15000,
  });
  const { data: edges } = useQuery(() => fetchServiceMap(), [], {
    refetchInterval: 15000,
  });

  const connectedServices = new Set<string>();
  for (const edge of edges || []) {
    connectedServices.add(edge.source);
    connectedServices.add(edge.target);
  }

  return (
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-slate-100">Services</h1>
        <span class="text-sm text-slate-500">
          {services?.length ?? 0} services discovered
        </span>
      </div>

      <div class="bg-slate-900 rounded-lg border border-slate-800 p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold text-slate-300">Service Map</h2>
            <p class="text-sm text-slate-500">
              Dependencies inferred from parent/child spans across traces.
            </p>
          </div>
          <span class="text-xs text-slate-500">{edges?.length ?? 0} edges</span>
        </div>

        {!edges?.length ? (
          <div class="text-center py-8">
            <div class="text-4xl mb-4">🗺️</div>
            <p class="text-sm text-slate-500 max-w-md mx-auto">
              No cross-service dependencies detected yet.
            </p>
          </div>
        ) : (
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="space-y-3">
              {(edges || []).map((edge) => (
                <div
                  key={`${edge.source}-${edge.target}`}
                  class="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-sm text-indigo-300 truncate">{edge.source}</div>
                      <div class="text-xs text-slate-500">calls</div>
                    </div>
                    <div class="text-slate-600">→</div>
                    <div class="min-w-0 text-right">
                      <div class="text-sm text-cyan-300 truncate">{edge.target}</div>
                      <div class="text-xs text-slate-500">{edge.count} spans</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div class="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div class="text-xs uppercase tracking-wide text-slate-500 mb-4">Connected services</div>
              <div class="flex flex-wrap gap-2">
                {(services || []).map((name) => (
                  <span
                    key={name}
                    class={`rounded-full px-3 py-1 text-sm ${
                      connectedServices.has(name)
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
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
