/**
 * A student's identity, read off the file they submit.
 *
 * The real app has no typed roster and no login — a student saves their passage as
 * "IndexNumber_First_Last" (Ashesi's convention: an eight-digit index number, the first
 * four digits an id and the last four their year of completion, then their name,
 * underscore-separated) and that filename IS the record. Nothing here is typed by hand,
 * and nothing here infers a name from prose — it reads exactly what they named the file,
 * including its capitalisation, rather than re-casing it and risking turning a real name
 * like "McNobert" into "Mcnobert".
 */

export interface Student {
  indexNumber: string
  name: string
}

export function studentFromFilename(filename: string): Student | null {
  const base = filename.replace(/\.[a-z0-9]+$/i, '').trim()
  const match = base.match(/^(\d{8})[\s_-]+(.+)$/)
  if (!match) return null
  const name = match[2].replace(/[\s_-]+/g, ' ').trim()
  return name ? { indexNumber: match[1], name } : null
}
