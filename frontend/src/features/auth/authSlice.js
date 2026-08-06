import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  user: null,
  accessToken: localStorage.getItem('sv_token'),
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
      if (accessToken) localStorage.setItem('sv_token', accessToken)
    },
    setUser: (state, action) => {
      state.user = action.payload
    },
    clearCredentials: (state) => {
      state.user = null
      state.accessToken = null
      localStorage.removeItem('sv_token')
    },
  },
})

export const { setCredentials, setUser, clearCredentials } = authSlice.actions

export const selectUser = (state) => state.auth.user
export const selectToken = (state) => state.auth.accessToken

export default authSlice.reducer
