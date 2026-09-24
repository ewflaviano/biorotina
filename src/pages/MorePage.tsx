import {
  Apple,
  ArrowRight,
  HeartHandshake,
  Pill,
  Settings2,
  Smartphone,
} from "lucide-react";
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
  {
    to: "/instalar",
    label: "Instalar no celular",
    detail: "Acesso rápido pela tela inicial",
    icon: Smartphone,
  },
  {
    to: "/apoiar",
    label: "Apoiar o projeto",
    detail: "Ajude a manter a Biorotina gratuita",
    icon: HeartHandshake,
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
