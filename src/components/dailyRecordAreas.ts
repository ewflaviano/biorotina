import {
  Activity,
  Apple,
  Droplets,
  Pill,
  Scale,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import type { DailyRecordKind } from "../domain/dailyRecords";

export const dailyRecordAreas: Record<
  DailyRecordKind,
  { label: string; to: string; icon: LucideIcon }
> = {
  weight: { label: "Medidas", to: "/peso", icon: Scale },
  activity: { label: "Atividade", to: "/atividades", icon: Activity },
  meal: { label: "Alimentação", to: "/alimentacao", icon: Apple },
  hydration: { label: "Hidratação", to: "/hidratacao", icon: Droplets },
  medication: { label: "Medicação", to: "/medicamentos", icon: Pill },
  habit: { label: "Hábitos", to: "/habitos", icon: Sprout },
};
