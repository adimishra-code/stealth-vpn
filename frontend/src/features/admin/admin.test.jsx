// Admin device extension (ADMIN-02): the ExtendModal must only submit valid
// day ranges and close on success, surfacing API errors instead of closing.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExtendModal from '../../components/admin/ExtendModal'
import { renderWithProviders } from '../../test/test-utils'

const { extendDevice } = vi.hoisted(() => ({
  extendDevice: vi.fn(),
}))

vi.mock('../../features/admin/adminApi', () => ({
  useExtendDeviceMutation: () => [extendDevice, { isLoading: false }],
}))

describe('ExtendModal (ADMIN-02)', () => {
  let onClose

  beforeEach(() => {
    onClose = vi.fn()
    extendDevice.mockReset().mockImplementation(() => ({ unwrap: async () => ({}) }))
  })

  it('shows the device name and a sensible default of 30 days', () => {
    renderWithProviders(<ExtendModal deviceId="d1" deviceName="phone-01" onClose={onClose} />)

    expect(screen.getByText('phone-01 — add days to current expiry')).toBeInTheDocument()
    expect(screen.getByLabelText('Days to add')).toHaveValue(30)
    expect(screen.getByRole('button', { name: 'Add 30 days' })).toBeEnabled()
  })

  it('submits the entered days and closes on success', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExtendModal deviceId="d1" deviceName="phone-01" onClose={onClose} />)

    await user.clear(screen.getByLabelText('Days to add'))
    await user.type(screen.getByLabelText('Days to add'), '45')
    await user.click(screen.getByRole('button', { name: 'Add 45 days' }))

    await waitFor(() => expect(extendDevice).toHaveBeenCalledWith({ deviceId: 'd1', days: 45 }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('disables submit for out-of-range values (0 and 366)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExtendModal deviceId="d1" deviceName="phone-01" onClose={onClose} />)

    const input = screen.getByLabelText('Days to add')
    await user.clear(input)
    await user.type(input, '0')
    expect(screen.getByRole('button', { name: 'Add 0 days' })).toBeDisabled()

    await user.clear(input)
    await user.type(input, '366')
    expect(screen.getByRole('button', { name: 'Add 366 days' })).toBeDisabled()
  })

  it('keeps the modal open and surfaces the API error on failure', async () => {
    const user = userEvent.setup()
    extendDevice.mockImplementation(() => ({
      unwrap: async () => {
        throw { data: { error: 'Device not found' } }
      },
    }))
    renderWithProviders(<ExtendModal deviceId="d1" deviceName="phone-01" onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Add 30 days' }))

    await waitFor(() => expect(extendDevice).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes without submitting when cancelled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExtendModal deviceId="d1" deviceName="phone-01" onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(extendDevice).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
