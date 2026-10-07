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
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  dateTimePt,
  parseBackup,
  totalRecords,
  validateAnthropometrics,
  type AppData,
} from "../domain/data";
import { compareBackup } from "../domain/backupComparison";
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

const recordsLabel = (count: number) =>
  `${count} ${count === 1 ? "registro" : "registros"}`;

export function SettingsPage() {
  const { scope } = useAppData();
  return <SettingsPageContent key={scope ?? "guest"} />;
}

function SettingsPageContent() {
  const { data, scope, mutate, replaceIfRevision } = useAppData();
  const profileKey = JSON.stringify(data.profile);
  const [draft, setDraft] = useState({
    profileKey,
    name: data.profile.displayName,
  });
  const name =
    draft.profileKey === profileKey ? draft.name : data.profile.displayName;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    data: AppData;
    scope: string | null;
    reviewedRevision: number;
  } | null>(null);
  const [legacy, setLegacy] = useState<AppData | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activePreview = preview?.scope === scope ? preview : null;
  const comparison = useMemo(
    () => (activePreview ? compareBackup(data, activePreview.data) : null),
    [activePreview, data],
  );
  const needsReview =
    activePreview !== null && activePreview.reviewedRevision !== data.revision;

  useEffect(() => {
    if (scope !== null) return;
    void loadLegacyData()
      .then(setLegacy)
      .catch(() => undefined);
  }, [scope]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await mutate((current) => ({
        ...current,
        profile: { ...current.profile, displayName: name.trim() },
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
    event.target.value = "";
    try {
      if (file.size > 10_000_000)
        throw new Error(
          "O arquivo é grande demais para importar (limite de 10 MB).",
        );
      const parsed = parseBackup(JSON.parse(await file.text()));
      validateAnthropometrics(parsed);
      setPreview({ data: parsed, scope, reviewedRevision: data.revision });
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
    if (!activePreview || !comparison) return;
    if (needsReview) {
      setError(
        "Os dados deste navegador mudaram. Confira a comparação atualizada antes de importar.",
      );
      return;
    }
    if (
      !window.confirm(
        `O arquivo substituirá ${recordsLabel(comparison.localTotal)} e o perfil deste navegador por ${recordsLabel(comparison.incomingTotal)}. Registros exclusivos deste navegador: ${comparison.onlyLocal}; registros com o mesmo identificador e conteúdo diferente: ${comparison.changed}. Deseja continuar?`,
      )
    )
      return;
    setError("");
    try {
      const hasLocalData =
        comparison.localTotal > 0 ||
        data.profile.displayName !== "" ||
        data.profile.heightCm !== null ||
        data.hydrationReminderTimes.length > 0;
      if (hasLocalData) downloadJson(data, "-antes-da-importacao");
      await replaceIfRevision(
        activePreview.reviewedRevision,
        activePreview.data,
      );
      setPreview(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage(
        "Importação concluída. Uma cópia dos dados anteriores foi preparada para download quando havia dados locais.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.startsWith("Os dados")
          ? "Os dados deste navegador mudaram. Confira a comparação atualizada antes de importar."
          : "Não foi possível importar. Os dados anteriores continuam neste navegador.",
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
                  setDraft({ profileKey, name: event.target.value })
                }
              />
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
          {activePreview && comparison && (
            <div className="import-preview">
              <strong>Compare antes de importar</strong>
              <p>
                Arquivo validado · última alteração:{" "}
                {dateTimePt(activePreview.data.updatedAt)}. A importação
                substitui todos os dados deste navegador; ela não une os
                registros.
              </p>
              <div className="backup-comparison-totals">
                <div>
                  <span>Neste navegador</span>
                  <strong>{comparison.localTotal}</strong>{" "}
                  {comparison.localTotal === 1 ? "registro" : "registros"}
                </div>
                <div>
                  <span>No arquivo</span>
                  <strong>{comparison.incomingTotal}</strong>{" "}
                  {comparison.incomingTotal === 1 ? "registro" : "registros"}
                </div>
              </div>
              <div
                className="backup-comparison-list"
                aria-label="Comparação por categoria"
              >
                {comparison.categories.map((category) => (
                  <div
                    className="backup-comparison-category"
                    key={category.key}
                  >
                    <strong>{category.label}</strong>
                    <div>
                      <span>
                        Só aqui <b>{category.onlyLocal}</b>
                      </span>
                      <span>
                        Só no arquivo <b>{category.onlyIncoming}</b>
                      </span>
                      <span>
                        Alterados <b>{category.changed}</b>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p
                className={`backup-comparison-note${
                  comparison.onlyLocal === 0 &&
                  comparison.changed === 0 &&
                  !comparison.profileChanged &&
                  !comparison.hydrationRemindersChanged
                    ? " backup-comparison-note-safe"
                    : ""
                }`}
              >
                {comparison.onlyLocal > 0
                  ? `${recordsLabel(comparison.onlyLocal)} ${comparison.onlyLocal === 1 ? "exclusivo" : "exclusivos"} deste navegador ${comparison.onlyLocal === 1 ? "deixará" : "deixarão"} de estar ${comparison.onlyLocal === 1 ? "disponível" : "disponíveis"} após a importação.`
                  : "Nenhum registro exclusivo deste navegador será removido."}{" "}
                Registros com o mesmo identificador e conteúdo diferente:{" "}
                {comparison.changed}.
                {comparison.profileChanged && " O perfil é diferente."}
                {comparison.hydrationRemindersChanged &&
                  " Os horários de lembrete de água são diferentes."}
              </p>
              <p>
                Se houver dados locais, uma cópia anterior será preparada para
                download. Confira se o arquivo foi guardado.
                {scope !== null &&
                  " Em uma conta conectada, a substituição poderá ser sincronizada com o Google Drive."}
              </p>
              {needsReview ? (
                <div className="backup-comparison-review" role="status">
                  <p>
                    Os dados deste navegador mudaram. Confira os novos números
                    antes de continuar.
                  </p>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => {
                      setPreview({
                        ...activePreview,
                        reviewedRevision: data.revision,
                      });
                      setError("");
                    }}
                  >
                    Conferi a comparação atualizada
                  </button>
                </div>
              ) : (
                <button
                  className="button secondary"
                  type="button"
                  onClick={importBackup}
                >
                  Importar este arquivo
                </button>
              )}
            </div>
          )}
          <Notice kind="warning">
            O arquivo contém seus dados pessoais em texto legível. Guarde a
            cópia com cuidado.
          </Notice>
          {scope === null && legacy && (
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
              <h2>Métricas e diagnóstico</h2>
              <p>Controle a medição de visitas e o envio de erros técnicos.</p>
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
