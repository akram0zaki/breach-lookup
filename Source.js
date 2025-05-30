// src/sources/Source.js
export default class Source {
  /**
   * @param {string} emailNorm – normalized (lower-cased & trimmed) email
   * @returns {Promise<Array<Record>>} – list of matches
   */
  async search(emailNorm) {
    throw new Error('search() not implemented');
  }
}
