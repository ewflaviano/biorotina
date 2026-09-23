import { halfHourTimes } from "../domain/time";
import { reminderTimeSchema } from "../domain/data";

export function TimeSelect({
  id,
  value,
  onChange,
  required = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const previousTime =
    reminderTimeSchema.safeParse(value).success &&
    !halfHourTimes.includes(value)
      ? value
      : null;

  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
    >
      <option value="">Escolha um horário</option>
      {previousTime && <option value={previousTime}>{previousTime}</option>}
      {halfHourTimes.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  );
}
