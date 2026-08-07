import { createSlice } from '@reduxjs/toolkit'

// sessionStorage: the token dies with the tab, so it can't persist into
// shared/same-machine sessions the way localStorage would (XSS exfil and
// localStorage-theft tools both read it; a fresh browser session should
// require a real login again anyway).
const initialState = {
  user: null,
  accessToken: sessionStorage.getItem('sv_token'),
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
      if (accessToken) sessionStorage.setItem('sv_token', accessToken)
    },
    setUser: (state, action) => {
      state.user = action.payload
    },
    clearCredentials: (state) => {
      state.user = null
      state.accessToken = null
      sessionStorage.removeItem('sv_token')
    },
  },
})

export const { setCredentials, setUser, clearCredentials } = authSlice.actions

export const selectUser = (state) => state.auth.user
export const selectToken = (state) => state.auth.accessToken

export default authSlice.reducer
