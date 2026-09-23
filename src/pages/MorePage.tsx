import { Apple, ArrowRight, Pill, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";

const links = [
  {
    to: "/alimentacao",
    label: "Alimentação",
    detail: "Refeições e calorias informadas",
    icon: Apple,
  },
  {
    to: "/medicamentos",
    label: "Medicação",
    detail: "Medicamentos e registros de uso",
    icon: Pill,
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    detail: "Perfil e backup dos seus dados",
    icon: Settings2,
  },
];

export function MorePage() {
  return (
    <>
      <PageHeader
        eyebrow="Sua rotina"
        title="Mais áreas"
        description="Acesse seus registros e preferências."
      />
      <nav className="more-links" aria-label="Outras áreas">
        {links.map(({ to, label, detail, icon: Icon }) => (
          <Link key={to} to={to} className="more-link">
            <span className="list-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </>
  );
}
