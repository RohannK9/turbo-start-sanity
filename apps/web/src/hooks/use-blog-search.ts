import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";
import type { BlogSearchResponse } from "@/lib/blog-search-response";

export function useBlogSearch(category: string) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 400).trim();
  const key = JSON.stringify([debouncedQuery, category]);
  const [selection, setSelection] = useState({ key: "", page: 1 });
  // A new query/category starts at page one without an effect fetching the old page first.
  const page = selection.key === key ? selection.page : 1;
  const hasQuery = searchQuery.trim().length > 0;
  const { data, isFetching, error } = useQuery({
    queryKey: ["blog-search", debouncedQuery, category, page],
    queryFn: async ({ signal }): Promise<BlogSearchResponse> => {
      const params = new URLSearchParams({
        q: debouncedQuery,
        category,
        page: String(page),
      });
      const response = await fetch(`/api/blog/search?${params}`, { signal });
      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "Too many searches. Please wait a minute before trying again."
            : "Search is temporarily unavailable. Please try again later."
        );
      }
      return response.json();
    },
    enabled: hasQuery && debouncedQuery.length > 0,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  return {
    searchQuery,
    setSearchQuery,
    hasQuery,
    error,
    results: data?.results ?? [],
    totalHits: data?.totalHits ?? 0,
    totalPages: data?.totalPages ?? 0,
    page,
    setPage: (next: number) => setSelection({ key, page: next }),
    isSearching: isFetching || searchQuery.trim() !== debouncedQuery,
  };
}
