/** Normalize obsolete direct forms of address without rewriting old chat records. */
export function addressReply(text: string, address: string): string {
  return text.replace(
    /(^|[，。！？、\n「“])(?:爸爸|爹爹|老爸|主人)(?=[，。！？、\s」”]|$)/g,
    (_match, prefix: string) => prefix + address,
  );
}
