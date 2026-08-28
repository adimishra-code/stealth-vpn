import { api } from '../../app/api'

export const serverApi = api.injectEndpoints({
  endpoints: (build) => ({
    listServers: build.query({
      query: () => '/servers',
      providesTags: ['Servers'],
    }),
    serverHealth: build.query({
      query: (name) => `/servers/${name}/health`,
    }),
    pingServers: build.query({
      query: () => '/servers/ping-all',
    }),
    pingServer: build.query({
      query: (name) => `/servers/${name}/ping`,
    }),
    getDailyBandwidth: build.query({
      query: (params = {}) => ({
        url: '/bandwidth/daily',
        params,
      }),
    }),
  }),
})

export const {
  useListServersQuery,
  useServerHealthQuery,
  usePingServersQuery,
  useLazyPingServersQuery,
  usePingServerQuery,
  useGetDailyBandwidthQuery,
} = serverApi

