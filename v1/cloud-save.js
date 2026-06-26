(function (global) {
  const FORMAT_VERSION = 2;
  const ITEM_TARGET_BYTES = 6500;
  const TOTAL_TARGET_BYTES = 95000;

  function utf8Bytes(value) {
    return new TextEncoder().encode(String(value)).length;
  }

  function storageItemBytes(key, value) {
    return utf8Bytes(key) + utf8Bytes(JSON.stringify(value));
  }

  function chunkDomainLibrary(domainLibrary, keyForIndex, targetBytes = ITEM_TARGET_BYTES) {
    const chunks = [];
    let chunk = {};

    for (const [domain, entry] of Object.entries(domainLibrary || {}).sort(([left], [right]) => left.localeCompare(right))) {
      const candidate = { ...chunk, [domain]: entry };
      const key = keyForIndex(chunks.length);
      if (Object.keys(chunk).length > 0 && storageItemBytes(key, candidate) > targetBytes) {
        chunks.push(chunk);
        chunk = { [domain]: entry };
      } else {
        chunk = candidate;
      }

      const currentKey = keyForIndex(chunks.length);
      if (storageItemBytes(currentKey, chunk) > targetBytes) {
        throw new Error(`Domain ${domain} is too large to sync.`);
      }
    }

    if (Object.keys(chunk).length > 0) chunks.push(chunk);
    return chunks;
  }

  function assembleDomainLibrary(chunks) {
    return Object.assign({}, ...(chunks || []));
  }

  global.BrowserTycoonCloudSave = Object.freeze({
    FORMAT_VERSION,
    ITEM_TARGET_BYTES,
    TOTAL_TARGET_BYTES,
    storageItemBytes,
    chunkDomainLibrary,
    assembleDomainLibrary
  });
})(globalThis);
