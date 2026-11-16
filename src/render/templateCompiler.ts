export function compileTemplate(html: string, data: Record<string, any>): string {
  let result = html;

  // Process #each blocks
  const eachRegex = /{{#each\s+([a-zA-Z0-9_]+)}}([\s\S]*?){{\/each}}/g;
  result = result.replace(eachRegex, (_, listName, itemTemplate) => {
    const list = data[listName];
    if (!Array.isArray(list) || list.length === 0) return '';

    return list.map(item => {
      let block = itemTemplate;
      if (typeof item === 'string' || typeof item === 'number') {
        block = block.replace(/{{this}}/g, String(item));
      } else if (typeof item === 'object' && item !== null) {
        for (const [k, v] of Object.entries(item)) {
          block = block.replace(new RegExp(`{{this\\.${k}}}`, 'g'), String(v ?? ''));
        }
      }
      return block;
    }).join('');
  });

  // Process #if blocks
  const ifRegex = /{{#if\s+([a-zA-Z0-9_]+)}}([\s\S]*?){{\/if}}/g;
  result = result.replace(ifRegex, (_, varName, innerContent) => {
    const val = data[varName];
    if (val && (!Array.isArray(val) || val.length > 0)) {
      return innerContent;
    }
    return '';
  });

  // Process simple variables {{key}}
  const varRegex = /{{([a-zA-Z0-9_]+)}}/g;
  result = result.replace(varRegex, (_, key) => {
    const val = data[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });

  return result;
}
