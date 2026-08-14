import { createSlice } from '@reduxjs/toolkit'

// The access token lives only in Redux memory — nothing is written to
// sessionStorage/localStorage (XSS-readable, survives into shared sessions).
// A reload requires fresh login or the silent httpOnly refresh-cookie
// handshake (/auth/refresh), which is out of JS reach.
const initialState = {
  user: null,
  accessToken: null,
  loading: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { accessToken, user } = action.payload
      state.accessToken = accessToken
      state.user = user ?? state.user
    },
    setUser: (state, action) => {
      state.user = action.payload
    },
    clearCredentials: (state) => {
      state.user = null
      state.accessToken = null
    },
  },
})

export const { setCredentials, setUser, clearCredentials } = authSlice.actions

export const selectUser = (state) => state.auth.user
export const selectToken = (state) => state.auth.accessToken

export default authSlice.reducer
