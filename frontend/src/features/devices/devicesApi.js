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
      query: (arg) => {
        const id = typeof arg === 'object' ? arg.id : arg
        const format = typeof arg === 'object' && arg.format ? arg.format : 'wireguard'
        return {
          url: `/devices/${id}/config?format=${format}`,
          method: 'POST',
          body: { format },
          responseHandler: 'text',
        }
      },
    }),
    getQr: build.query({
      query: (id) => ({ url: `/devices/${id}/qr` }),
    }),
    getVless: build.query({
      query: (id) => ({ url: `/devices/${id}/vless` }),
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
  useGetVlessQuery,
  useToggleModeMutation,
  useGetBandwidthQuery,
} = devicesApi
