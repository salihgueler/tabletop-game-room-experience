// Thin frontend wrapper around the AWS Blocks backend. The `api`/`authApi`
// clients are the auto-generated, fully-typed RPC clients from the workspace
// package. This module adds a couple of auth conveniences the raw client lacks.
import { api, authApi } from 'aws-blocks'
import { broadcastAuthChange } from '@aws-blocks/blocks/ui'

export { api, authApi }

export async function signUp(username, password) {
  const state = await authApi.setAuthState({ action: 'signUp', username, password })
  broadcastAuthChange(state.user ?? null)
  return state
}

export async function signIn(username, password) {
  const state = await authApi.setAuthState({ action: 'signIn', username, password })
  broadcastAuthChange(state.user ?? null)
  return state
}

export async function signOut() {
  await authApi.setAuthState({ action: 'signOut' })
  broadcastAuthChange(null)
}
