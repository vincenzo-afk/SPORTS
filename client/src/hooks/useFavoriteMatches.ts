import { useCallback, useEffect, useState } from "react";

const FAVORITES_KEY = "matchday.favorite-match-ids";

function readFavorites(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function useFavoriteMatches() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setFavoriteIds(readFavorites());
    setIsReady(true);
  }, []);

  const toggleFavorite = useCallback((matchId: string) => {
    setFavoriteIds((current) => {
      const next = current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId];
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { favoriteIds, isReady, toggleFavorite };
}
