import { useEffect } from "react";

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} | Gen-Z` : "Gen-Z — Define Your Style";
    return () => {
      document.title = previous;
    };
  }, [title]);
}
