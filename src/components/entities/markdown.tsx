import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Safe Markdown renderer (no raw HTML). [[REF]] mentions become links to the entity.
 */
export function Markdown({ content, resolve }: { content: string; resolve?: Record<string, string> }) {
  const withMentions = content.replace(/\[\[([A-Za-z]{3}-\d{4,})\]\]/g, (_, ref: string) => {
    const r = ref.toUpperCase();
    return `[${r}](${resolve?.[r] ?? `/search?q=${r}`} "mention")`;
  });
  return (
    <div className="prose-lifeos">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, title, children }) =>
            title === "mention" ? (
              <a href={href} className="entity-mention">
                {children}
              </a>
            ) : (
              <a href={href} target={href?.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener">
                {children}
              </a>
            ),
        }}
      >
        {withMentions}
      </ReactMarkdown>
    </div>
  );
}
