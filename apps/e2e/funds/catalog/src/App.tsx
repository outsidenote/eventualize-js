import { useEffect, useState } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import AsyncApiComponent from "@asyncapi/react-component/lib/esm/without-parser.js";
import "@asyncapi/react-component/styles/default.min.css";

interface ServiceResult {
  id: string;
  displayName: string;
  baseUrl: string;
  status: "online" | "partial" | "offline";
  openapi: unknown | null;
  asyncapi: unknown | null;
  fetchedAt: string;
  error?: string;
}

interface SpecsResponse {
  appName: string;
  lastRefreshAt: string | null;
  services: ServiceResult[];
}

export function App() {
  const [data, setData] = useState<SpecsResponse | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/specs")
      .then((r) => r.json() as Promise<SpecsResponse>)
      .then((d) => {
        setData(d);
        if (d.services.length > 0) setActiveId(d.services[0].id);
      });
  }, []);

  if (!data) return <div style={{ padding: 20 }}>Loading specs…</div>;

  const active = data.services.find((s) => s.id === activeId) ?? null;

  return (
    <>
      <header>
        <h1 style={{ margin: 0, fontSize: 18 }}>{data.appName} — service catalog</h1>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {data.lastRefreshAt ? `Last refresh: ${new Date(data.lastRefreshAt).toLocaleTimeString()}` : "Refreshing…"}
        </span>
      </header>
      <div className="tabs">
        {data.services.map((s) => (
          <div
            key={s.id}
            className={`tab ${s.id === activeId ? "active" : ""}`}
            onClick={() => setActiveId(s.id)}
          >
            <span className={`health ${s.status}`} />
            {s.displayName} ({s.status})
          </div>
        ))}
      </div>
      <div className="panel">
        {active ? <ServicePanel service={active} /> : <p>No service selected</p>}
      </div>
    </>
  );
}

function ServicePanel({ service }: { service: ServiceResult }) {
  return (
    <>
      <h2>REST — {service.displayName}</h2>
      {service.openapi ? (
        <SwaggerUI
          spec={service.openapi as object}
          requestInterceptor={(req: { url: string }) => {
            try {
              const u = new URL(req.url);
              const base = new URL(service.baseUrl);
              if (u.origin === base.origin) {
                req.url = `${window.location.origin}/api/proxy/${service.id}${u.pathname}${u.search}`;
              }
            } catch {
              /* relative URL — leave alone */
            }
            return req;
          }}
        />
      ) : (
        <p>No OpenAPI spec available.</p>
      )}
      <h2>Async — {service.displayName}</h2>
      {service.asyncapi ? (
        <AsyncApiComponent
          schema={service.asyncapi as object}
          config={{ show: { sidebar: false, errors: false } }}
        />
      ) : (
        <p>No AsyncAPI spec available.</p>
      )}
      {service.error && <p style={{ color: "#ef4444" }}>Error: {service.error}</p>}
    </>
  );
}
