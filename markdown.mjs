import { Marked } from "./vendor/marked.mjs";

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

// Keep raw HTML inert and restrict generated links. Do not run Foundry
// enrichers here: this tooltip is display-only, with no rolls or scripts.
const markdown = new Marked({
  async: false,
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) { return escapeHTML(text); },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      // Reject encoded/obfuscated schemes as well as javascript:/data: links.
      if (!/^(https?:\/\/|mailto:)/i.test(href) || /[\u0000-\u0020\u007f]/.test(href)) return label;
      const tooltip = title ? ` title="${escapeHTML(title)}"` : "";
      return `<a href="${escapeHTML(href)}"${tooltip} tabindex="-1" rel="noopener noreferrer">${label}</a>`;
    },
    // Small, transient tooltips display image descriptions instead of loading
    // media (which would change their size after positioning).
    image({ text }) { return escapeHTML(text); }
  }
});

export function renderMarkdown(source) {
  return markdown.parse(String(source ?? ""));
}
