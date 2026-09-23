import type { AppData } from "../domain/data";

export function downloadJson(data: AppData, suffix = "") {
  const content = JSON.stringify(data, null, 2);
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `biorotina-${new Date().toISOString().slice(0, 10)}${suffix}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
