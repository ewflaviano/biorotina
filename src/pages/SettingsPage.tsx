import {
  Cloud,
  Download,
  FileJson2,
  ShieldCheck,
  ChartNoAxesCombined,
  Upload,
  UserRound,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  dateTimePt,
  parseBackup,
  parseDecimal,
  totalRecords,
  validateAnthropometrics,
  MIN_HEIGHT_CM,
  MAX_HEIGHT_CM,
  type AppData,
} from "../domain/data";
import { Notice, PageHeader } from "../components/Layout";
import { useAppData } from "../state/AppDataContext";
import { downloadJson } from "../sync/download";
import { DriveBackup } from "../sync/DriveBackup";
import { AnalyticsChoice } from "../analytics/AnalyticsChoice";
import { GeminiSettings } from "../ai/GeminiSettings";
import { Link } from "react-router-dom";
import { loadLegacyData } from "../storage/indexedDb";
import { PushControl } from "../components/PushControl";
import { InfoDisclosure } from "../components/InfoDisclosure";

export function SettingsPage() {
  const { data, mutate, replace } = useAppData();
  const profileKey = JSON.stringify(data.profile);
  const [draft, setDraft] = useState({
    profileKey,
    name: data.profile.displayName,
    height: data.profile.heightCm?.toString().replace(".", ",") ?? "",
  });
  const name =
    draft.profileKey === profileKey ? draft.name : data.profile.displayName;
  const height =
    draft.profileKey === profileKey
      ? draft.height
      : (data.profile.heightCm?.toString().replace(".", ",") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<AppData | null>(null);
  const [legacy, setLegacy] = useState<AppData | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadLegacyData()
      .then(setLegacy)
      .catch(() => undefined);
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const heightCm = height.trim()
        ? parseDecimal(height, "uma altura")
        : null;
      if (
        heightCm !== null &&
        (heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM)
      )
        throw new Error(
          `Confira a altura: informe entre ${MIN_HEIGHT_CM} e ${MAX_HEIGHT_CM} cm.`,
        );
      await mutate((current) => ({
        ...current,
        profile: { displayName: name.trim(), heightCm },
      }));
      setMessage("Perfil salvo neste navegador.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar o perfil.",
      );
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setPreview(null);
    setError("");
    setMessage("");
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error(
          "O arquivo é grande demais para importar (limite de 10 MB).",
        );
      const parsed = parseBackup(JSON.parse(await file.text()));
      validateAnthropometrics(parsed);
      setPreview(parsed);
    } catch (cause) {
      setError(
        cause instanceof Error &&
          (cause.message.startsWith("O arquivo é grande") ||
            cause.message.startsWith("O arquivo contém"))
          ? cause.message
          : "Arquivo incompatível. Selecione um backup JSON da Biorotina em uma versão compatível.",
      );
    }
  }

  async function importBackup() {
    if (!preview) return;
    const existing = totalRecords(data);
    const incoming = totalRecords(preview);
    if (
      !window.confirm(
        `Este arquivo tem ${incoming} registros. Ele substituirá os ${existing} registros e o perfil deste navegador. Deseja continuar?`,
      )
    )
      return;
    setError("");
    try {
      if (existing) downloadJson(data, "-antes-da-importacao");
      await replace(preview);
      setPreview(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage(
        "Importação concluída. Uma cópia dos dados anteriores foi preparada para download quando havia registros locais.",
      );
    } catch {
      setError(
        "Não foi possível importar. Os dados anteriores continuam neste navegador.",
      );
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Preferências"
        title="Configurações"
        description="Ajuste seu perfil e mantenha uma cópia dos seus dados."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Plano para fotos com IA</h2>
          <p>Até 10 análises de refeições por foto ao dia. R$ 8,99 por mês.</p>
          <Link className="text-link" to="/assinatura">
            Ver minha assinatura
          </Link>
        </section>
        <GeminiSettings />
        <PushControl />
        <section className="panel">
          <div className="card-title">
            <span className="list-icon">
              <UserRound size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Perfil</h2>
            </div>
          </div>
          <form onSubmit={saveProfile} className="form-grid">
            <div className="field">
              <label htmlFor="profile-name">
                Como você quer ser chamado?{" "}
                <span className="optional">opcional</span>
              </label>
              <input
                id="profile-name"
                maxLength={80}
                placeholder="Seu nome"
                value={name}
                onChange={(event) =>
                  setDraft({ profileKey, name: event.target.value, height })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="profile-height">
                Altura em cm <span className="optional">opcional</span>
              </label>
              <input
                id="profile-height"
                inputMode="decimal"
                placeholder="Ex.: 168"
                value={height}
                onChange={(event) =>
                  setDraft({ profileKey, name, height: event.target.value })
                }
              />
              <small>Usada apenas para calcular o IMC.</small>
            </div>
            <button className="button primary">Salvar perfil</button>
          </form>
          <InfoDisclosure label="Sobre estas informações">
            <p>
              Esses dados ficam neste navegador e ajudam a contextualizar seus
              registros.
            </p>
          </InfoDisclosure>
        </section>
        <section className="panel">
          <div className="card-title">
            <span className="list-icon">
              <FileJson2 size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Cópia dos dados</h2>
              <p>Guarde uma cópia dos seus dados em um lugar seguro.</p>
            </div>
          </div>
          <div className="backup-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => {
                try {
                  downloadJson(data);
                  setError("");
                  setMessage(
                    "Download do backup iniciado. Confira o arquivo na pasta de downloads.",
                  );
                } catch {
                  setError("Não foi possível iniciar o download do backup.");
                }
              }}
            >
              <Download size={18} />
              Exportar dados
            </button>
            <input
              ref={fileInput}
              id="backup-file"
              type="file"
              accept="application/json,.json"
              onChange={chooseFile}
            />
            <label
              className="button secondary upload-button"
              htmlFor="backup-file"
            >
              <Upload size={18} />
              Escolher backup
            </label>
          </div>
          {preview && (
            <div className="import-preview">
              <strong>Arquivo pronto para importar</strong>
              <p>
                {totalRecords(preview)} registros · perfil{" "}
                {preview.profile.displayName ? "preenchido" : "sem nome"}. A
                importação substitui os dados deste navegador.
              </p>
              <p>
                Última alteração no arquivo: {dateTimePt(preview.updatedAt)}.
              </p>
              <ul className="backup-preview-list">
                <li>Peso: {preview.weights.length}</li>
                <li>Atividades: {preview.activities.length}</li>
                <li>Refeições: {preview.meals.length}</li>
                <li>Água: {preview.hydrationEntries.length}</li>
                <li>Medicamentos: {preview.medications.length}</li>
                <li>Registros de uso: {preview.medicationLogs.length}</li>
              </ul>
              <button
                className="button secondary"
                type="button"
                onClick={importBackup}
              >
                Importar este arquivo
              </button>
            </div>
          )}
          <Notice kind="warning">
            O arquivo contém seus dados pessoais em texto legível. Guarde a
            cópia com cuidado.
          </Notice>
          {legacy && (
            <div className="drive-guest-copy">
              <strong>Registros anteriores neste navegador</strong>
              <p>
                Encontramos {totalRecords(legacy)} registros de uma versão
                anterior. Eles não foram atribuídos à conta Google atual.
              </p>
              <button
                className="button secondary"
                type="button"
                onClick={() => downloadJson(legacy, "-antigos")}
              >
                <Download size={18} aria-hidden="true" /> Baixar registros
                anteriores
              </button>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="card-title">
            <span className="list-icon">
              <Cloud size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Google Drive</h2>
              <p>Sincronização opcional entre seus dispositivos.</p>
            </div>
          </div>
          <DriveBackup />
        </section>
        <section className="panel">
          <div className="card-title">
            <span className="list-icon">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Seus dados</h2>
              <p>
                {totalRecords(data)}{" "}
                {totalRecords(data) === 1
                  ? "registro salvo"
                  : "registros salvos"}{" "}
                neste navegador.
              </p>
            </div>
          </div>
          <InfoDisclosure label="Cuidados com seus dados">
            <p>
              Limpar os dados do navegador pode apagar estes registros. Exporte
              um backup regularmente.
            </p>
          </InfoDisclosure>
        </section>
        <section className="panel">
          <div className="card-title">
            <span className="list-icon">
              <ChartNoAxesCombined size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>Métricas de acesso</h2>
              <p>Veja e controle a medição de visitas da Biorotina.</p>
            </div>
          </div>
          <AnalyticsChoice />
        </section>
      </div>
      {(message || error) && (
        <div className="floating-feedback" role={error ? "alert" : "status"}>
          {error || message}
        </div>
      )}
    </>
  );
}
