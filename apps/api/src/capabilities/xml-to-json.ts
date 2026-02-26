import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("xml-to-json", async (input: CapabilityInput) => {
  const xmlString = ((input.xml_string as string) ?? (input.xml as string) ?? (input.task as string) ?? "").trim();
  if (!xmlString) throw new Error("'xml_string' is required.");

  let elementCount = 0;
  let attributesPreserved = false;

  function parseXml(xml: string): unknown {
    let pos = 0;

    function skipWhitespace() {
      while (pos < xml.length && /\s/.test(xml[pos])) pos++;
    }

    function parseNode(): unknown {
      skipWhitespace();

      // CDATA
      if (xml.startsWith("<![CDATA[", pos)) {
        const end = xml.indexOf("]]>", pos);
        const text = xml.slice(pos + 9, end);
        pos = end + 3;
        return text;
      }

      // Comment
      if (xml.startsWith("<!--", pos)) {
        pos = xml.indexOf("-->", pos) + 3;
        return null;
      }

      // Processing instruction / declaration
      if (xml.startsWith("<?", pos)) {
        pos = xml.indexOf("?>", pos) + 2;
        return null;
      }

      // Element
      if (xml[pos] === "<") {
        pos++; // skip <
        // Read tag name
        let tagName = "";
        while (pos < xml.length && !/[\s/>]/.test(xml[pos])) {
          tagName += xml[pos++];
        }
        elementCount++;

        // Parse attributes
        const attrs: Record<string, string> = {};
        skipWhitespace();
        while (pos < xml.length && xml[pos] !== ">" && xml[pos] !== "/") {
          let attrName = "";
          while (pos < xml.length && !/[\s=/>]/.test(xml[pos])) {
            attrName += xml[pos++];
          }
          skipWhitespace();
          if (xml[pos] === "=") {
            pos++; // skip =
            skipWhitespace();
            const quote = xml[pos];
            if (quote === '"' || quote === "'") {
              pos++;
              let val = "";
              while (pos < xml.length && xml[pos] !== quote) {
                val += xml[pos++];
              }
              pos++; // skip closing quote
              if (attrName) { attrs[attrName] = val; attributesPreserved = true; }
            }
          }
          skipWhitespace();
        }

        // Self-closing
        if (xml[pos] === "/") {
          pos += 2; // skip />
          const result: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(attrs)) result[`@${k}`] = v;
          return { [tagName]: Object.keys(result).length > 0 ? result : null };
        }

        pos++; // skip >

        // Parse children
        const children: unknown[] = [];
        let textContent = "";

        while (pos < xml.length) {
          skipWhitespace();
          if (xml.startsWith(`</${tagName}`, pos)) {
            pos = xml.indexOf(">", pos) + 1;
            break;
          }
          if (xml[pos] === "<") {
            const child = parseNode();
            if (child !== null) children.push(child);
          } else {
            while (pos < xml.length && xml[pos] !== "<") {
              textContent += xml[pos++];
            }
          }
        }

        textContent = textContent.trim();

        // Text-only element (no children, no attributes)
        if (children.length === 0 && Object.keys(attrs).length === 0) {
          let val: unknown = textContent;
          if (/^-?\d+$/.test(textContent)) val = parseInt(textContent, 10);
          else if (/^-?\d+\.\d+$/.test(textContent)) val = parseFloat(textContent);
          else if (textContent === "true") val = true;
          else if (textContent === "false") val = false;
          return { [tagName]: val };
        }

        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(attrs)) result[`@${k}`] = v;
        if (textContent) result["#text"] = textContent;

        // Group children by tag
        for (const child of children) {
          if (typeof child === "object" && child !== null) {
            // Children come from parseNode which wraps in tag
            // We need to handle them differently — they're already parsed
            // Just merge into result
            for (const [k, v] of Object.entries(child as Record<string, unknown>)) {
              if (k in result) {
                if (!Array.isArray(result[k])) result[k] = [result[k]];
                (result[k] as unknown[]).push(v);
              } else {
                result[k] = v;
              }
            }
          }
        }

        return { [tagName]: Object.keys(result).length > 0 ? result : textContent || null };
      }

      // Raw text
      let text = "";
      while (pos < xml.length && xml[pos] !== "<") {
        text += xml[pos++];
      }
      return text.trim() || null;
    }

    // Skip BOM and declaration
    if (xml.startsWith("\uFEFF")) pos = 1;

    let result = null;
    while (pos < xml.length) {
      skipWhitespace();
      if (pos >= xml.length) break;
      const node = parseNode();
      if (node !== null) result = node;
    }
    return result;
  }

  const json = parseXml(xmlString);
  const rootElement = typeof json === "object" && json !== null ? Object.keys(json as Record<string, unknown>)[0] ?? "root" : "root";

  return {
    output: {
      json,
      root_element: rootElement,
      element_count: elementCount,
      attributes_preserved: attributesPreserved,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
