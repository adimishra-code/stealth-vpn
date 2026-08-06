import { api } from '../../app/api'

export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
    listUsers: build.query({
      query: (params) => ({ url: '/admin/users', params }),
      providesTags: ['Users'],
    }),
    updateUser: build.mutation({
      query: ({ id, ...body }) => ({ url: `/admin/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Users'],
    }),
    getRevenue: build.query({
      query: () => '/admin/revenue',
      providesTags: ['Revenue'],
    }),
    getAdminBandwidth: build.query({
      query: () => '/admin/bandwidth',
      providesTags: ['Bandwidth'],
    }),
    getAlerts: build.query({
      query: () => '/admin/alerts',
      providesTags: ['Alerts'],
    }),
  }),
})

export const {
  useListUsersQuery,
  useUpdateUserMutation,
  useGetRevenueQuery,
  useGetAdminBandwidthQuery,
  useGetAlertsQuery,
} = adminApi
