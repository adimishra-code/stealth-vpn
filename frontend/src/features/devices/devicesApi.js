import { api } from '../../app/api'

export const devicesApi = api.injectEndpoints({
  endpoints: (build) => ({
    listDevices: build.query({
      query: () => '/devices',
      providesTags: ['Devices'],
    }),
    addDevice: build.mutation({
      query: (body) => ({ url: '/devices', method: 'POST', body }),
      invalidatesTags: ['Devices'],
    }),
    revokeDevice: build.mutation({
      query: (id) => ({ url: `/devices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Devices'],
    }),
    downloadConfig: build.mutation({
      query: (id) => ({ url: `/devices/${id}/config`, method: 'POST', responseHandler: 'text' }),
    }),
    getQr: build.query({
      query: (id) => ({ url: `/devices/${id}/qr` }),
    }),
    toggleMode: build.mutation({
      query: ({ id, mode }) => ({ url: `/devices/${id}/mode`, method: 'PATCH', body: { mode } }),
      invalidatesTags: ['Devices'],
    }),
    getBandwidth: build.query({
      query: (id) => ({ url: `/devices/${id}/bandwidth` }),
    }),
  }),
})

export const {
  useListDevicesQuery,
  useAddDeviceMutation,
  useRevokeDeviceMutation,
  useDownloadConfigMutation,
  useGetQrQuery,
  useToggleModeMutation,
  useGetBandwidthQuery,
} = devicesApi
