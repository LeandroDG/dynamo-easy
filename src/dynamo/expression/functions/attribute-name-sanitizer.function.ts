/**
 * @module expression
 */
/**
 * @hidden
 */
export function attributeNameSanitizer(attributeName: string) {
  // Replace special characters with '_' and dot with '__'
  return attributeName.replace(/-|_/g, '_').replace(/\./g, '__')
}
