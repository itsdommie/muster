/** Save text as a file: through the system share sheet where a web view cannot download, otherwise as an ordinary download. */
export async function saveTextFile(name: string, mime: string, text: string): Promise<boolean> {
  if (window.muster?.saveFile) return window.muster.saveFile(name, mime, text);
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
