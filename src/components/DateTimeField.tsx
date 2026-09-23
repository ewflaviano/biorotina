import { toLocalDateTime } from "../domain/data";
import { TimeSelect } from "./TimeSelect";

export function DateTimeField({
  id,
  value,
  onChange,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`field ${className}`.trim()}
      role="group"
      aria-label="Data e hora"
    >
      <div className="field-label-row">
        <strong>Data e hora</strong>
        <button
          type="button"
          onClick={() => onChange(toLocalDateTime(new Date().toISOString()))}
        >
          Agora
        </button>
      </div>
      <div className="date-time-controls">
        <div className="field">
          <label htmlFor={id}>Data</label>
          <input
            id={id}
            type="date"
            value={value.split("T")[0] ?? ""}
            onChange={(event) =>
              onChange(
                `${event.target.value}T${value.split("T")[1] ?? "00:00"}`,
              )
            }
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-time`}>Horário (24 h)</label>
          <TimeSelect
            id={`${id}-time`}
            value={value.split("T")[1] ?? ""}
            onChange={(time) =>
              onChange(`${value.split("T")[0] ?? ""}T${time}`)
            }
            required
          />
        </div>
      </div>
    </div>
  );
}
