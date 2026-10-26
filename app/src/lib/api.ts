import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

export class ApiError extends Error {}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new ApiError(json.errors.map((e: { message: string }) => e.message).join('; '))
  return json.data as T
}

/** Runs a GraphQL query; results are cached by query + variables. */
export function useGql<T>(query: string, variables?: Record<string, unknown>, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [query, variables ?? {}],
    queryFn: () => gql<T>(query, variables),
    placeholderData: keepPreviousData,
    enabled: opts?.enabled,
  })
}

/**
 * Runs a GraphQL mutation. Every change can move totals elsewhere (budgets, net worth...),
 * so all cached queries refresh afterwards.
 */
export function useGqlMutation<T, V extends Record<string, unknown> = Record<string, unknown>>(mutation: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (variables: V) => gql<T>(mutation, variables),
    onSuccess: () => qc.invalidateQueries(),
  })
}
