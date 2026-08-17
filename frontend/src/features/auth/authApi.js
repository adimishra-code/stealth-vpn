import { api } from '../../app/api'

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    register: build.mutation({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),
    verifyEmail: build.mutation({
      query: (body) => ({ url: '/auth/verify', method: 'POST', body }),
    }),
    login: build.mutation({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    refresh: build.mutation({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
    }),
    logout: build.mutation({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['Users'],
    }),
    logoutAll: build.mutation({
      query: () => ({ url: '/auth/sessions', method: 'DELETE' }),
      invalidatesTags: ['Users'],
    }),
    totpSetup: build.mutation({
      query: () => ({ url: '/auth/totp/setup', method: 'POST' }),
    }),
    totpVerify: build.mutation({
      query: (body) => ({ url: '/auth/totp/verify', method: 'POST', body }),
    }),
    totpDisable: build.mutation({
      query: (body) => ({ url: '/auth/totp/disable', method: 'POST', body }),
    }),
    forgotPassword: build.mutation({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),
    resendVerify: build.mutation({
      query: (body) => ({ url: '/auth/resend-verify', method: 'POST', body }),
    }),
    deleteAccount: build.mutation({
      query: () => ({ url: '/auth/me', method: 'DELETE' }),
      invalidatesTags: ['Users', 'Devices'],
    }),
    me: build.query({
      query: () => '/auth/me',
      providesTags: ['Users'],
    }),
  }),
})

export const {
  useRegisterMutation,
  useVerifyEmailMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useResendVerifyMutation,
  useMeQuery,
  useLogoutAllMutation,
  useTotpSetupMutation,
  useTotpVerifyMutation,
  useTotpDisableMutation,
  useDeleteAccountMutation,
} = authApi
