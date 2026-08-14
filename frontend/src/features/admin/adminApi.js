import { api } from '../../app/api'

export const adminApi = api.injectEndpoints({
  endpoints: (build) => ({
    // POST (not GET): filters/search ride the body so identifiers never land
    // in nginx access logs (PRIV-07/08).
    listUsers: build.query({
      query: (body) => ({ url: '/admin/users', method: 'POST', body }),
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
    getPoolStatus: build.query({
      query: () => '/admin/pool-status',
    }),
    getAuditLogs: build.query({
      query: (params) => ({ url: '/admin/audit-logs', params }),
      providesTags: ['AuditLogs'],
    }),
    listDevices: build.query({
      query: (body) => ({ url: '/admin/devices', method: 'POST', body }),
      providesTags: ['AdminDevices'],
    }),
    expireDevice: build.mutation({
      query: (deviceId) => ({
        url: `/admin/devices/${deviceId}/expire`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _err, deviceId) => [
        { type: 'Devices', id: deviceId },
        'Devices',
      ],
    }),
    revokeDevice: build.mutation({
      query: (deviceId) => ({
        url: `/admin/devices/${deviceId}/revoke`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _err, deviceId) => [
        { type: 'Devices', id: deviceId },
        'Devices',
        'Users',
      ],
    }),
    extendDevice: build.mutation({
      query: ({ deviceId, days }) => ({
        url: `/admin/devices/${deviceId}/extend`,
        method: 'POST',
        body: { days },
      }),
      invalidatesTags: (_result, _err, { deviceId }) => [
        { type: 'Devices', id: deviceId },
        'Devices',
      ],
    }),
    banUser: build.mutation({
      query: ({ userId, banReason }) => ({
        url: `/admin/users/${userId}/ban`,
        method: 'POST',
        body: { banReason },
      }),
      invalidatesTags: (_result, _err, { userId }) => [
        { type: 'Users', id: userId },
        'Users',
        'Devices',
      ],
    }),
    resetBandwidth: build.mutation({
      query: (deviceId) => ({
        url: `/admin/devices/${deviceId}/reset-bandwidth`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _err, deviceId) => [
        { type: 'Devices', id: deviceId },
        'Devices',
      ],
    }),
  }),
})

export const {
  useListUsersQuery,
  useUpdateUserMutation,
  useGetRevenueQuery,
  useGetAdminBandwidthQuery,
  useGetAlertsQuery,
  useGetPoolStatusQuery,
  useGetAuditLogsQuery,
  useListDevicesQuery,
  useExpireDeviceMutation,
  useRevokeDeviceMutation,
  useExtendDeviceMutation,
  useBanUserMutation,
  useResetBandwidthMutation,
} = adminApi
