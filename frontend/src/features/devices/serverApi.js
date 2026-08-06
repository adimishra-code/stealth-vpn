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
  }),
})

export const { useListServersQuery, useServerHealthQuery } = serverApi
