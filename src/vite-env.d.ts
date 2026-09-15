/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Set to '1' for the judge-testing build.
   *
   * That build boots straight into the trial console instead of the role chooser: one
   * machine, one reading, five people taking turns, and nothing on screen that a
   * participant would have to be walked past before answering a question.
   */
  readonly VITE_TRIAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
