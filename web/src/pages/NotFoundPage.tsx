import { Link } from "react-router-dom";
import { Card } from "../ui/Card";

export function NotFoundPage() {
  return (
    <Card title="Página não encontrada" subtitle="O caminho acessado não existe.">
      <Link to="/" className="inline-flex text-sm text-[rgba(var(--accent),1)] hover:underline">
        Voltar para Home
      </Link>
    </Card>
  );
}
