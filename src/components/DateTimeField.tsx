import { CalendarDays } from "lucide-react";
import { useRef, useState } from "react";
import { toLocalDateTime } from "../domain/data";
import { TimeSelect } from "./TimeSelect";

function formatDate(value: string): string {
  const [year = "", month = "", day = ""] =
    value.split("T")[0]?.split("-") ?? [];
  return year && month && day ? `${day}/${month}/${year}` : "";
}

function formatDateTyping(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toIsoDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T12:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  )
    return null;
  return `${year}-${month}-${day}`;
}

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
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);
  const dateText = dateDraft ?? formatDate(value);

  function changeDate(next: string) {
    const formatted = formatDateTyping(next);
    setDateDraft(formatted);
    const isoDate = toIsoDate(formatted);
    if (isoDate) {
      setDateDraft(null);
      onChange(`${isoDate}T${value.split("T")[1] ?? "00:00"}`);
    }
  }

  function resetInvalidDate() {
    if (!toIsoDate(dateText)) setDateDraft(null);
  }

  function useCurrentDateTime() {
    setDateDraft(null);
    onChange(toLocalDateTime(new Date().toISOString()));
  }

  function openDatePicker() {
    const picker = datePickerRef.current;
    if (!picker) return;
    const pickerWithDialog = picker as HTMLInputElement & {
      showPicker?: () => void;
    };
    if (pickerWithDialog.showPicker) pickerWithDialog.showPicker();
    else picker.click();
  }

  return (
    <div
      className={`field ${className}`.trim()}
      role="group"
      aria-label="Data e hora"
    >
      <div className="field-label-row">
        <strong>Data e hora</strong>
        <button type="button" onClick={useCurrentDateTime}>
          Agora
        </button>
      </div>
      <div className="date-time-controls">
        <div className="field">
          <label htmlFor={id}>Data</label>
          <div className="date-input">
            <input
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="dd/mm/aaaa"
              value={dateText}
              onChange={(event) => changeDate(event.target.value)}
              onBlur={resetInvalidDate}
              maxLength={10}
              required
            />
            <button
              type="button"
              className="date-picker-button"
              aria-label="Escolher data"
              onClick={openDatePicker}
            >
              <CalendarDays size={18} aria-hidden="true" />
            </button>
            <input
              ref={datePickerRef}
              className="date-picker-native"
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              value={value.split("T")[0] ?? ""}
              onChange={(event) => {
                const nextValue = `${event.target.value}T${value.split("T")[1] ?? "00:00"}`;
                setDateDraft(null);
                onChange(nextValue);
              }}
            />
          </div>
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
