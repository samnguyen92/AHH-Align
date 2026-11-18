declare module 'bcryptjs' {
  function genSalt(rounds?: number): Promise<string>;
  function hash(s: string, salt?: number | string): Promise<string>;
  function compare(s: string, hash: string): Promise<boolean>;
  const _default: { genSalt: typeof genSalt; hash: typeof hash; compare: typeof compare };
  export default _default;
  export { genSalt, hash, compare };
}
