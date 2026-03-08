import { Link, useLocation } from "react-router-dom";

type Crumb = { label: string; to: string };

function titleize(s: string) {
  const map: Record<string, string> = {
    apps: "Aplicativos",
    comercial: "Comercial",
    academico: "Acadêmico",
    financeiro: "Financeiro",
    contas: "Conta",
    contatos: "Contato",
    leads: "Lead",
    oportunidades: "Oportunidade",
    novo: "Novo",
    lista: "Lista",
  };
  return map[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length === 0) return [{ label: "Home", to: "/" }];

  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];

  // /apps/...
  if (parts[0] === "apps") {
    crumbs.push({ label: "Aplicativos", to: "/apps" });

    if (parts[1]) {
      crumbs.push({ label: titleize(parts[1]), to: `/apps/${parts[1]}` });
    }

    // resto da rota (objeto/ação/id)
    if (parts.length > 2) {
      let acc = `/apps/${parts[1]}`;
      for (let i = 2; i < parts.length; i++) {
        acc += `/${parts[i]}`;
        const isId = i === 3 && parts[2] && parts[3]; // /obj/:id
        crumbs.push({
          label: isId ? `#${parts[i]}` : titleize(parts[i]),
          to: acc,
        });
      }
    }

    return crumbs;
  }

  // fallback
  crumbs.push({ label: titleize(parts[0]), to: `/${parts[0]}` });
  return crumbs;
}

export function BreadcrumbBar() {
  const { pathname } = useLocation();
  const crumbs = buildCrumbs(pathname);

  return (
    <div className="panel rounded-2xl px-3 py-2">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-[rgb(var(--muted))]">
        {crumbs.map((c, i) => (
          <span key={c.to} className="flex items-center gap-1">
            <Link className="hover:text-[rgb(var(--text))]" to={c.to}>
              {c.label}
            </Link>
            {i < crumbs.length - 1 && <span className="opacity-60">/</span>}
          </span>
        ))}
      </nav>
    </div>
  );
}