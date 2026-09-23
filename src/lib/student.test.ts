import { describe, expect, it } from 'vitest'
import { studentFromFilename } from './student'

/**
 * The real app has no roster and no login — this is the only place a student's identity
 * comes from, so it has to actually match how people save files, not just the one tidy
 * example it was designed against.
 */
describe('studentFromFilename', () => {
  it('reads the confirmed convention: 8-digit index, underscore, name', () => {
    expect(studentFromFilename('68742026_McNobert_Amoah.docx')).toEqual({
      indexNumber: '68742026',
      name: 'McNobert Amoah',
    })
  })

  it('preserves the name’s own capitalisation rather than re-casing it', () => {
    // A naive title-case would turn "McNobert" into "Mcnobert" — this must not do that.
    expect(studentFromFilename('68742026_McNobert_Amoah.pdf')?.name).toBe('McNobert Amoah')
  })

  it('accepts spaces or dashes as the separator, not just underscores', () => {
    expect(studentFromFilename('68742026 McNobert Amoah.pdf')?.name).toBe('McNobert Amoah')
    expect(studentFromFilename('68742026-McNobert-Amoah.pdf')?.name).toBe('McNobert Amoah')
  })

  it('is not thrown by a file with no extension', () => {
    expect(studentFromFilename('68742026_McNobert_Amoah')).toEqual({
      indexNumber: '68742026',
      name: 'McNobert Amoah',
    })
  })

  it('returns null for a filename with no 8-digit index number', () => {
    expect(studentFromFilename('essay.docx')).toBeNull()
    expect(studentFromFilename('McNobert Amoah.docx')).toBeNull()
  })

  it('returns null when the number is not followed by a name', () => {
    expect(studentFromFilename('68742026.docx')).toBeNull()
  })

  it('does not match a run of digits shorter or longer than eight', () => {
    expect(studentFromFilename('687420_McNobert_Amoah.docx')).toBeNull()
    expect(studentFromFilename('6874202612_McNobert_Amoah.docx')).toBeNull()
  })
})
