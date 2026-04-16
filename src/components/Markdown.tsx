import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// GFM gives us autolinks, strikethrough, tables; breaks keep newline handling
// close to what GitHub does in Issue / Draft bodies.
marked.setOptions({ gfm: true, breaks: true });

// External-looking links in user-supplied bodies should open in a new tab and
// drop window.opener to avoid reverse-tabnabbing. Hook runs once at module
// load because modules are cached.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLAnchorElement) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export default function Markdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const html = useMemo(() => {
    const parsed = marked.parse(content, { async: false });
    const raw = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(raw);
  }, [content]);
  return (
    <div
      className={`markdown-body ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
