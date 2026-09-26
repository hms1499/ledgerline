/** Hand the payer a file. The object URL is revoked a tick later, not
 *  straight after click(): some browsers start the download asynchronously
 *  and a URL revoked first saves nothing. */
export function saveFile(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
