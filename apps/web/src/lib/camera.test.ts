import { describe, expect, it } from 'vitest'
import { cameraMessages, cameraPrecheck, classifyCameraError } from './camera'

const err = (name: string) => Object.assign(new Error(name), { name })

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'missing'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'busy'],
    ['OverconstrainedError', 'unsupported-constraints'],
    ['TypeError', 'unsupported'],
    ['SomethingNew', 'denied'],
  ])('%s → %s', (name, status) => expect(classifyCameraError(err(name))).toBe(status))

  it('copes with non-errors', () => {
    expect(classifyCameraError(null)).toBe('denied')
    expect(classifyCameraError('boom')).toBe('denied')
  })

  it('has a message for every problem', () => {
    for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'TypeError'])
      expect(cameraMessages[classifyCameraError(err(name))]).toBeTruthy()
  })
})

describe('cameraPrecheck', () => {
  it('flags insecure pages before missing APIs', () => {
    expect(cameraPrecheck({ secure: false, hasGetUserMedia: false })).toBe('insecure')
    expect(cameraPrecheck({ secure: true, hasGetUserMedia: false })).toBe('unsupported')
    expect(cameraPrecheck({ secure: true, hasGetUserMedia: true })).toBeNull()
  })
})
