import type { ReplayItem } from "../api/types";
import { formatAmount } from "../format";

export function PayloadCard({ item }: { readonly item: ReplayItem }) {
  const p = item.event_payload;
  return (
    <div className="card">
      <h3>event_payload</h3>
      <table className="kv">
        <tbody>
          <tr>
            <td>type</td>
            <td>{item.event_meta.eventType}</td>
          </tr>
          <tr>
            <td>description</td>
            <td>{p.description}</td>
          </tr>
          <tr>
            <td>value</td>
            <td>{formatAmount(p.value, p.currency)}</td>
          </tr>
          {p.reason !== undefined && (
            <tr>
              <td>reason</td>
              <td className="error">{p.reason}</td>
            </tr>
          )}
        </tbody>
      </table>
      <h3 style={{ marginTop: 10 }}>messages</h3>
      {item.messages.length === 0 ? (
        <span className="dim">(none)</span>
      ) : (
        item.messages.map((m, i) => (
          <span key={i} className="badge badge-server">
            📣 {m.messageType}
          </span>
        ))
      )}
      <details>
        <summary>raw JSON</summary>
        <pre>{JSON.stringify({ event_payload: p, messages: item.messages }, null, 2)}</pre>
      </details>
    </div>
  );
}
