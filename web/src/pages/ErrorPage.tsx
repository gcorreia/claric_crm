import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function ErrorPage() {
  const err = useRouteError();

  let title = "Erro";
  let details: string = "";

  if (isRouteErrorResponse(err)) {
    title = `Erro ${err.status}`;
    details = err.statusText || "";
  } else if (err instanceof Error) {
    title = err.name || "Erro";
    details = err.message;
  } else {
    details = typeof err === "string" ? err : JSON.stringify(err, null, 2);
  }

  return (
    <div style={{ padding: 16 }}>
      <div className="panel" style={{ borderRadius: 16, padding: 16 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{title}</h2>
        <p style={{ marginTop: 8, fontSize: 12, color: "rgb(var(--muted))" }}>
          Se isso apareceu, a app não está “em branco”: ela está te mostrando o erro.
        </p>
        <pre className="panel-2" style={{ marginTop: 12, borderRadius: 16, padding: 12, overflow: "auto", fontSize: 12 }}>
          {details}
        </pre>
      </div>
    </div>
  );
}
