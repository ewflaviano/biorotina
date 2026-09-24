import { KeyRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  loadGeminiKey,
  removeGeminiKey,
  saveGeminiKey,
} from "../storage/indexedDb";
import { InfoDisclosure } from "../components/InfoDisclosure";

export function GeminiSettings() {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadGeminiKey()
      .then((saved) => {
        if (active) setHasKey(Boolean(saved));
      })
      .catch(() => {
        if (active)
          setMessage("Não foi possível verificar a chave neste navegador.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveGeminiKey(key);
      setHasKey(true);
      setKey("");
      setMessage(
        "Chave salva neste aparelho. Agora você pode analisar uma foto em Alimentação.",
      );
    } catch {
      setMessage("Não foi possível salvar a chave neste navegador.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeGeminiKey();
      setHasKey(false);
      setKey("");
      setMessage("Chave removida deste aparelho.");
    } catch {
      setMessage("Não foi possível remover a chave.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" id="gemini-settings">
      <div className="card-title">
        <span className="list-icon">
          <KeyRound size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>Fotos de refeições com Gemini</h2>
          <p>
            Use sua própria chave do Google para receber sugestões de alimentos
            e calorias.
          </p>
        </div>
      </div>
      <p className="muted">
        {hasKey
          ? "Chave configurada neste aparelho."
          : "Nenhuma chave configurada neste aparelho."}{" "}
        A análise é opcional; o registro manual continua disponível.
      </p>
      <form className="form-grid" onSubmit={save}>
        <div className="field full">
          <label htmlFor="gemini-api-key">
            {hasKey ? "Substituir chave Gemini" : "Sua chave Gemini"}
          </label>
          <input
            id="gemini-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="Cole a chave aqui"
            required
          />
        </div>
        <div className="gemini-key-actions">
          <button className="button primary" disabled={busy || !key.trim()}>
            Salvar chave
          </button>
          {hasKey && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={remove}
            >
              Remover chave
            </button>
          )}
        </div>
      </form>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
      <details className="gemini-tutorial">
        <summary>Como criar minha chave?</summary>
        <ol>
          <li>
            Acesse o{" "}
            <a
              href="https://aistudio.google.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google AI Studio
            </a>{" "}
            e entre com sua conta Google.
          </li>
          <li>Crie uma chave de API em um projeto da sua conta.</li>
          <li>
            Copie a chave e cole no campo acima. Use uma chave separada para
            este app e confira os limites de uso no Google.
          </li>
          <li>
            Em Alimentação, escolha uma foto e toque em “Analisar foto”. Revise
            tudo antes de salvar.
          </li>
        </ol>
      </details>
      <InfoDisclosure label="Como a chave é usada">
        <p>
          A chave fica somente neste navegador: não entra no backup JSON nem no
          Google Drive. Ao analisar uma foto, a imagem e sua chave são enviadas
          diretamente ao Gemini. Quem tiver acesso a este aparelho ou ao
          navegador pode alcançar a chave; revogue-a no Google AI Studio se
          necessário. O uso pode consumir sua cota ou gerar cobranças conforme
          sua conta Google.
        </p>
      </InfoDisclosure>
    </section>
  );
}
