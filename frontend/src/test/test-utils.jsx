import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../features/auth/authSlice'
import { api } from '../app/api'

// Renders a component with the real Redux store (auth slice + RTK Query
// middleware) inside a MemoryRouter, mirroring main.jsx.
export function renderWithProviders(ui, { preloadedState = {}, route = '/' } = {}) {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
    preloadedState,
  })

  return {
    store,
    ...render(<Provider store={store}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></Provider>),
  }
}

// Builds a preloaded auth state for guard tests.
export function authState({ token = null, user = null } = {}) {
  return { auth: { user, accessToken: token, loading: false } }
}
