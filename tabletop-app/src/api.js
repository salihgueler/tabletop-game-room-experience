// Thin frontend wrapper around the AWS Blocks backend. The `api`/`authApi`
// clients are the auto-generated, fully-typed RPC clients from the workspace
// package. This module adds a couple of auth conveniences the raw client lacks.
import { api, authApi } from 'cdk-blocks'
import { broadcastAuthChange } from 'aws-cdk-blocks/ui'

export { api, authApi }

// Sign-up (Auth, aws-cdk-blocks 1.0) confirms the email address with an emailed
// code. The returned state is 'confirmingSignUp' until confirmSignUp() runs.
export async function signUp(username, password, email) {
  const state = await authApi.setAuthState({ action: 'signUp', username, password, email })
  broadcastAuthChange(state.user ?? null)
  return state
}

// Enter the emailed code, then finish with autoSignIn so the user does not
// have to type their password again.
export async function confirmSignUp(username, code) {
  const confirmed = await authApi.setAuthState({ action: 'confirmSignUp', username, code })
  if (!confirmed.actions?.some((a) => a.name === 'autoSignIn')) return confirmed
  const state = await authApi.setAuthState({ action: 'autoSignIn', username })
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
