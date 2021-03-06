/**
 * Module dependencies
 */

var normalizeValueToSet = require('../utils/query/private/normalize-value-to-set');


/**
 * validate()
 *
 * Verify that a value would be valid for a given attribute, then return it, loosely coerced.
 *
 * > Note that this validates the value in the same way it would be checked
 * > if it was passed in to an `.update()` query-- NOT a `.create()`!!
 *
 * ```
 * // Check the given string and return a normalized version.
 * var normalizedBalance = BankAccount.validate('balance', '349.86');
 * //=> 349.86
 *
 * // Note that if normalization is not possible, this throws:
 * try {
 *   var normalizedBalance = BankAccount.validate('balance', '$349.86');
 * } catch (e) {
 *   switch (e.code) {
 *     case 'E_VALIDATION':
 *       console.log(e);
 *       // => '[Error: Invalid `bankAccount`]'
 *       _.each(e.all, function(woe){
 *         console.log(woe.attrName+': '+woe.message);
 *       });
 *       break;
 *     default: throw e;
 *   }
 * }
 *
 * ```
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 *
 * @param {String} attrName
 *        The name of the attribute to validate against.
 *
 * @param {Ref} value
 *        The value to validate/normalize.
 *
 * --
 *
 * @returns {Ref}
 *          The successfully-normalized value.  (MAY or MAY NOT be the same as the original reference.)
 *
 * --
 *
 * @throws {Error} If the value should be ignored/stripped (e.g. because it is `undefined`, or because it
 *                 does not correspond with a recognized attribute, and the model def has `schema: true`)
 *         @property {String} code
 *                   - E_SHOULD_BE_IGNORED
 *
 *
 * @throws {Error} If it encounters incompatible usage in the provided `value`,
 *                 including e.g. the case where an invalid value is specified for
 *                 an association.
 *         @property {String} code
 *                   - E_HIGHLY_IRREGULAR
 *
 * @throws {Error} If validation fails completely (i.e. value not close enough to coerce automatically)
 *   |     @property {String} code
 *   |      - E_VALIDATION
 *   |     @property {Array} all
 *   |         [
 *   |           {
 *   |             attrName: 'foo',
 *   |             message: '...',
 *   |             ...
 *   |           }
 *   |         ]
 *
 * @throws {Error} If anything else unexpected occurs.
 */

module.exports = function validate(attrName, value) {

  try {
    return normalizeValueToSet(value, attrName, this.identity, this.waterline);
  } catch (e) {
    switch (e.code) {
      // case 'E_VIOLATES_RULES':
      //   break;// TODO: deal with this (but probably do it in normalizeValueTSet...not here)
      // case 'E_INVALID':
      //   break;// TODO: deal with this (but probably do it in normalizeValueTSet...not here)
      default:
        throw e;
    }
  }

};
