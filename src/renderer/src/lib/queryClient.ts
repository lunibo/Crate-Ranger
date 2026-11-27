import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime: nicht mehr angezeigte Daten 30 min im Speicher halten (Zurück-Navigation ohne Neuladen)
    queries: { staleTime: 5 * 60_000, gcTime: 30 * 60_000, retry: 1, refetchOnWindowFocus: false }
  }
})
