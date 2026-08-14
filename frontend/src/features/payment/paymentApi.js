import { api } from '../../app/api'

export const paymentApi = api.injectEndpoints({
  endpoints: (build) => ({
    createOrder: build.mutation({
      query: (body) => ({ url: '/payment/create-order', method: 'POST', body }),
    }),
    verifyPayment: build.mutation({
      query: (body) => ({ url: '/payment/verify', method: 'POST', body }),
      invalidatesTags: ['Devices', 'Invoices', 'Users'],
    }),
    createStripeSession: build.mutation({
      query: (body) => ({ url: '/payment/stripe/session', method: 'POST', body }),
    }),
    confirmStripe: build.mutation({
      query: (body) => ({ url: '/payment/stripe/confirm', method: 'POST', body }),
      invalidatesTags: ['Devices', 'Invoices', 'Users'],
    }),
    listInvoices: build.query({
      query: () => '/payment/invoices',
      providesTags: ['Invoices'],
    }),
  }),
})

export const {
  useCreateOrderMutation,
  useVerifyPaymentMutation,
  useCreateStripeSessionMutation,
  useConfirmStripeMutation,
  useListInvoicesQuery,
} = paymentApi