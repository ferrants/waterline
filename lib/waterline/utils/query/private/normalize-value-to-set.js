/**
 * Module dependencies
 */

var util = require('util');
var assert = require('assert');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var rttc = require('rttc');
var anchor = require('anchor');
var getModel = require('../../ontology/get-model');
var getAttribute = require('../../ontology/get-attribute');
var isValidAttributeName = require('./is-valid-attribute-name');
var normalizePkValue = require('./normalize-pk-value');
var normalizePkValues = require('./normalize-pk-values');


/**
 * normalizeValueToSet()
 *
 * Validate and normalize the provided `value`, hammering it destructively into a format
 * that is compatible with the specified attribute.
 *
 * This function has a return value.   But realize that this is only because the provided value
 * _might_ be a string, number, or some other primitive that is NOT passed by reference, and thus
 * must be replaced, rather than modified.
 *
 * --
 *
 * @param  {Ref} value
 *         The value to set (i.e. from the `valuesToSet` or `newRecord` query keys of a "stage 1 query").
 *         (If provided as `undefined`, it will be ignored)
 *         > WARNING:
 *         > IN SOME CASES (BUT NOT ALL!), THE PROVIDED VALUE WILL
 *         > UNDERGO DESTRUCTIVE, IN-PLACE CHANGES JUST BY PASSING IT
 *         > IN TO THIS UTILITY.
 *
 * @param {String} supposedAttrName
 *        The "supposed attribute name"; i.e. the LHS the provided value came from (e.g. "id" or "favoriteBrands")
 *        > Useful for looking up the appropriate attribute definition.
 *
 * @param {String} modelIdentity
 *        The identity of the model this value is for (e.g. "pet" or "user")
 *        > Useful for looking up the Waterline model and accessing its attribute definitions.
 *
 * @param {Ref} orm
 *        The Waterline ORM instance.
 *        > Useful for accessing the model definitions.
 *
 * @param {Boolean?} allowCollectionAttrs
 *        Optional.  If provided and set to `true`, then `supposedAttrName` will be permitted
 *        to match a plural ("collection") association.  Otherwise, attempting that will fail
 *        with E_HIGHLY_IRREGULAR.
 *
 * --
 *
 * @returns {Ref}
 *          The successfully-normalized value, ready for use within the `valuesToSet` or `newRecord`
 *          query key of a stage 2 query. (May or may not be the original reference.)
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
 *
 * @throws {Error} If the provided `value` has an incompatible data type.
 *   |     @property {String} code
 *   |               - E_INVALID
 *   |
 *   | This is only versus the attribute's declared "type", or other similar type safety issues  --
 *   | certain failed checks for associations result in a different error code (see above).
 *   |
 *   | Remember:
 *   | This is the case where a _completely incorrect type of data_ was passed in.
 *   | This is NOT a high-level "anchor" validation failure! (see below for that)
 *   | > Unlike anchor validation errors, this exception should never be negotiated/parsed/used
 *   | > for delivering error messages to end users of an application-- it is carved out
 *   | > separately purely to make things easier to follow for the developer.
 *
 *
 * @throws {Error} If the provided `value` violates one or more of the high-level validation rules
 *   |             configured for the corresponding attribute.
 *   |     @property {String} code
 *   |               - E_VIOLATES_RULES
 *   |     @property {Array} ruleViolations
 *   |               e.g.
 *   |               ```
 *   |               [
 *   |                 {
 *   |                   rule: 'minLength',    //(isEmail/isNotEmptyString/max/isNumber/etc)
 *   |                   message: 'Too few characters (max 30)'
 *   |                 }
 *   |               ]
 *   |               ```
 *
 * @throws {Error} If anything else unexpected occurs.
 */
module.exports = function normalizeValueToSet(value, supposedAttrName, modelIdentity, orm, allowCollectionAttrs) {

  // ================================================================================================
  assert(_.isString(supposedAttrName) && supposedAttrName !== '', '`supposedAttrName` must be a non-empty string.');
  // (`modelIdentity` and `orm` will be automatically checked by calling `getModel()` below)
  // ================================================================================================



  //   ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ███╗   ███╗ ██████╗ ██████╗ ███████╗██╗
  //  ██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║
  //  ██║     ███████║█████╗  ██║     █████╔╝     ██╔████╔██║██║   ██║██║  ██║█████╗  ██║
  //  ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║
  //  ╚██████╗██║  ██║███████╗╚██████╗██║  ██╗    ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗
  //   ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝    ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
  //
  //   █████╗ ███╗   ██╗██████╗      █████╗ ████████╗████████╗██████╗
  //  ██╔══██╗████╗  ██║██╔══██╗    ██╔══██╗╚══██╔══╝╚══██╔══╝██╔══██╗
  //  ███████║██╔██╗ ██║██║  ██║    ███████║   ██║      ██║   ██████╔╝
  //  ██╔══██║██║╚██╗██║██║  ██║    ██╔══██║   ██║      ██║   ██╔══██╗
  //  ██║  ██║██║ ╚████║██████╔╝    ██║  ██║   ██║      ██║   ██║  ██║
  //  ╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝     ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝
  //

  // Look up the Waterline model.
  // > This is so that we can reference the original model definition.
  var WLModel;
  try {
    WLModel = getModel(modelIdentity, orm);
  } catch (e) {
    switch (e.code) {
      case 'E_MODEL_NOT_REGISTERED': throw new Error('Consistency violation: '+e.message);
      default: throw e;
    }
  }//</catch>


  // This local variable is used to hold a reference to the attribute def
  // that corresponds with this value (if there is one).
  var correspondingAttrDef;
  try {
    correspondingAttrDef = getAttribute(supposedAttrName, modelIdentity, orm);
  } catch (e) {
    switch (e.code) {

      case 'E_ATTR_NOT_REGISTERED':
        // If no matching attr def exists, then just leave `correspondingAttrDef`
        // undefined and continue... for now anyway.
        break;

      default:
        throw e;

    }
  }//</catch>

  //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┌─┐┌┬┐┌┬┐┬─┐┬┌┐ ┬ ┬┌┬┐┌─┐  ┌┐┌┌─┐┌┬┐┌─┐
  //  │  ├─┤├┤ │  ├┴┐  ├─┤ │  │ ├┬┘│├┴┐│ │ │ ├┤   │││├─┤│││├┤
  //  └─┘┴ ┴└─┘└─┘┴ ┴  ┴ ┴ ┴  ┴ ┴└─┴└─┘└─┘ ┴ └─┘  ┘└┘┴ ┴┴ ┴└─┘

  // If this model declares `schema: true`...
  if (WLModel.hasSchema === true) {

    // Check that this key corresponded with a recognized attribute definition.
    //
    // > If no such attribute exists, then fail gracefully by bailing early, indicating
    // > that this value should be ignored (For example, this might cause this value to
    // > be stripped out of the `newRecord` or `valuesToSet` query keys.)
    if (!correspondingAttrDef) {
      throw flaverr('E_SHOULD_BE_IGNORED', new Error(
        'This model declares itself `schema: true`, but this value does not match '+
        'any recognized attribute (thus it will be ignored).'
      ));
    }//-•

  }//</else if `hasSchema === true` >
  // ‡
  // Else if this model declares `schema: false`...
  else if (WLModel.hasSchema === false) {

    // Check that this key is a valid Waterline attribute name, at least.
    if (!isValidAttributeName(supposedAttrName)) {
      throw flaverr('E_HIGHLY_IRREGULAR', new Error('This is not a valid name for an attribute.'));
    }//-•

  }
  // ‡
  else {
    throw new Error(
      'Consistency violation: Every instantiated Waterline model should always have the `hasSchema` flag '+
      'as either `true` or `false` (should have been automatically derived from the `schema` model setting '+
      'shortly after construction.  And `schema` should have been verified as existing by waterline-schema).  '+
      'But somehow, this model\'s (`'+modelIdentity+'`) `hasSchema` property is as follows: '+
      util.inspect(WLModel.hasSchema, {depth:5})+''
    );
  }//</ else >





  //   ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗    ██╗   ██╗ █████╗ ██╗     ██╗   ██╗███████╗
  //  ██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝    ██║   ██║██╔══██╗██║     ██║   ██║██╔════╝
  //  ██║     ███████║█████╗  ██║     █████╔╝     ██║   ██║███████║██║     ██║   ██║█████╗
  //  ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗     ╚██╗ ██╔╝██╔══██║██║     ██║   ██║██╔══╝
  //  ╚██████╗██║  ██║███████╗╚██████╗██║  ██╗     ╚████╔╝ ██║  ██║███████╗╚██████╔╝███████╗
  //   ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝      ╚═══╝  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝
  //
  // Validate+lightly coerce this value, both as schema-agnostic data,
  // and vs. the corresponding attribute definition's declared `type`,
  // `model`, or `collection`.

  // If this value is `undefined`, then bail early, indicating that it should be ignored.
  if (_.isUndefined(value)) {
    throw flaverr('E_SHOULD_BE_IGNORED', new Error(
      'This value is `undefined`.  Remember: in Sails/Waterline, we always treat keys with '+
      '`undefined` values as if they were never there in the first place.'
    ));
  }//-•

  //  ┌─┐┌─┐┌─┐┌─┐┬┌─┐┬┌─┐┌┬┐  ┬  ┬┌─┐┬  ┬ ┬┌─┐  ┬┌─┐  ┌─┐┌─┐┬─┐  ┌─┐┌┐┌
  //  └─┐├─┘├┤ │  │├┤ │├┤  ││  └┐┌┘├─┤│  │ │├┤   │└─┐  ├┤ │ │├┬┘  ├─┤│││
  //  └─┘┴  └─┘└─┘┴└  ┴└─┘─┴┘   └┘ ┴ ┴┴─┘└─┘└─┘  ┴└─┘  └  └─┘┴└─  ┴ ┴┘└┘
  //  ╦ ╦╔╗╔╦═╗╔═╗╔═╗╔═╗╔═╗╔╗╔╦╔═╗╔═╗╔╦╗  ┌─┐┌┬┐┌┬┐┬─┐┬┌┐ ┬ ┬┌┬┐┌─┐
  //  ║ ║║║║╠╦╝║╣ ║  ║ ║║ ╦║║║║╔═╝║╣  ║║  ├─┤ │  │ ├┬┘│├┴┐│ │ │ ├┤
  //  ╚═╝╝╚╝╩╚═╚═╝╚═╝╚═╝╚═╝╝╚╝╩╚═╝╚═╝═╩╝  ┴ ┴ ┴  ┴ ┴└─┴└─┘└─┘ ┴ └─┘
  //
  // If this value doesn't actually match an attribute definition...
  if (!correspondingAttrDef) {

    // IWMIH then we already know this model has `schema: false`.
    // So if this value doesn't match a recognized attribute def,
    // then we'll validate it as `type: json`.
    //
    // > This is because we don't want to send a potentially-circular/crazy
    // > value down to the adapter unless it corresponds w/ a `type: 'ref'` attribute.
    value = rttc.validate('json', value);

  }//‡
  //  ┌─┐┌─┐┬─┐  ╔═╗╦═╗╦╔╦╗╔═╗╦═╗╦ ╦  ╦╔═╔═╗╦ ╦  ╔═╗╔╦╗╔╦╗╦═╗╦╔╗ ╦ ╦╔╦╗╔═╗
  //  ├┤ │ │├┬┘  ╠═╝╠╦╝║║║║╠═╣╠╦╝╚╦╝  ╠╩╗║╣ ╚╦╝  ╠═╣ ║  ║ ╠╦╝║╠╩╗║ ║ ║ ║╣
  //  └  └─┘┴└─  ╩  ╩╚═╩╩ ╩╩ ╩╩╚═ ╩   ╩ ╩╚═╝ ╩   ╩ ╩ ╩  ╩ ╩╚═╩╚═╝╚═╝ ╩ ╚═╝
  else if (WLModel.primaryKey === supposedAttrName) {

    try {
      value = normalizePkValue(value, correspondingAttrDef.type);
    } catch (e) {
      switch (e.code) {

        case 'E_INVALID_PK_VALUE':
          throw flaverr('E_HIGHLY_IRREGULAR', new Error(
            'Invalid primary key value.  '+e.message
          ));

        default:
          throw e;
      }
    }

  }//‡
  //  ┌─┐┌─┐┬─┐  ╔═╗╦  ╦ ╦╦═╗╔═╗╦    ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔
  //  ├┤ │ │├┬┘  ╠═╝║  ║ ║╠╦╝╠═╣║    ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║
  //  └  └─┘┴└─  ╩  ╩═╝╚═╝╩╚═╩ ╩╩═╝  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝
  else if (correspondingAttrDef.collection) {

    // If properties are not allowed for plural ("collection") associations,
    // then throw an error.
    if (!allowCollectionAttrs) {
      throw flaverr('E_HIGHLY_IRREGULAR', new Error(
        'This kind of query does not allow values to be set for plural (`collection`) associations '+
        '(instead, you should use `replaceCollection()`).  But instead, for `'+supposedAttrName+'`, '+
        'got: '+util.inspect(value, {depth:5})+''
      ));
    }//-•

    // Ensure that this is an array, and that each item in the array matches
    // the expected data type for a pk value of the associated model.
    try {
      value = normalizePkValues(value, getAttribute(getModel(correspondingAttrDef.collection, orm).primaryKey, correspondingAttrDef.collection, orm).type);
    } catch (e) {
      switch (e.code) {
        case 'E_INVALID_PK_VALUE':
          throw flaverr('E_HIGHLY_IRREGULAR', new Error(
            'If specifying the value for a plural (`collection`) association, you must do so by '+
            'providing an array of associated ids representing the associated records.  But instead, '+
            'for `'+supposedAttrName+'`, got: '+util.inspect(value, {depth:5})+''
          ));
        default: throw e;
      }
    }

  }//‡
  //  ┌─┐┌─┐┬─┐  ╔═╗╦╔╗╔╔═╗╦ ╦╦  ╔═╗╦═╗  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔
  //  ├┤ │ │├┬┘  ╚═╗║║║║║ ╦║ ║║  ╠═╣╠╦╝  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║
  //  └  └─┘┴└─  ╚═╝╩╝╚╝╚═╝╚═╝╩═╝╩ ╩╩╚═  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝
  else if (correspondingAttrDef.model) {

    // If `null` was specified, then it _might_ be OK.
    if (_.isNull(value)) {

      // We allow `null` for singular associations UNLESS they are required.
      //
      // > This is a bit different than `required` elsewhere in the world of Waterline.
      // > (Normally, required just means "not undefined"!)
      // >
      // > But when it comes to persistence (i.e. JSON, databases, APIs, etc.),
      // > we often equate `undefined` and `null`.  But in Waterline, if the RHS of a key
      // > is `undefined`, it means the same thing as if the key wasn't provided at all.
      // > This is done on purpose, and it's definitely a good thing.  But because of that,
      // > we have to use `null` to indicate when a singular association "has no value".
      // >
      // > Side note: for databases like MongoDB, where there IS a difference between
      // > undefined and `null`, we ensure `null` is always passed down to the adapter
      // > for all declared attributes on create (see the `normalize-new-record.js` utility
      // > for more information.)
      if (correspondingAttrDef.required) {
        throw flaverr('E_HIGHLY_IRREGULAR', new Error(
          'Cannot set `null` as the value for `'+supposedAttrName+'`.  `null` _can_ be '+
          'used as a value for some singular ("model") associations, but only if they '+
          'are optional.  (This one is `required: true`.)'
        ));
      }//-•

    }//‡
    // Otherwise, ensure that this value matches the expected data type for a pk value
    // of the associated model (normalizing it, if appropriate/possible.)
    else {

      try {
        value = normalizePkValue(value, getAttribute(getModel(correspondingAttrDef.model, orm).primaryKey, correspondingAttrDef.model, orm).type);
      } catch (e) {
        switch (e.code) {
          case 'E_INVALID_PK_VALUE':
            throw flaverr('E_HIGHLY_IRREGULAR', new Error(
              'Expecting an id representing the associated record, or `null` to indicate '+
              'there will be no associated record.  But the specified value is not a valid '+
              '`'+supposedAttrName+'`.  '+e.message
            ));
          default:
            throw e;
        }
      }//</catch>

    }//</else (not null)>

  }//‡
  //  ┌─┐┌─┐┬─┐  ╔╦╗╦╔═╗╔═╗╔═╗╦  ╦  ╔═╗╔╗╔╔═╗╔═╗╦ ╦╔═╗  ╔═╗╔╦╗╔╦╗╦═╗╦╔╗ ╦ ╦╔╦╗╔═╗
  //  ├┤ │ │├┬┘  ║║║║╚═╗║  ║╣ ║  ║  ╠═╣║║║║╣ ║ ║║ ║╚═╗  ╠═╣ ║  ║ ╠╦╝║╠╩╗║ ║ ║ ║╣
  //  └  └─┘┴└─  ╩ ╩╩╚═╝╚═╝╚═╝╩═╝╩═╝╩ ╩╝╚╝╚═╝╚═╝╚═╝╚═╝  ╩ ╩ ╩  ╩ ╩╚═╩╚═╝╚═╝ ╩ ╚═╝
  // Otherwise, the corresponding attr def is just a normal attr--not an association or primary key.
  // > We'll use loose validation (& thus also light coercion) on the value and see what happens.
  else {
    assert(_.isString(correspondingAttrDef.type) && correspondingAttrDef.type !== '', 'There is no way this attribute (`'+supposedAttrName+'`) should have been allowed to be registered with neither a `type`, `model`, nor `collection`!  Here is the attr def: '+util.inspect(correspondingAttrDef, {depth:5})+'');


    // First, check if this is an auto-*-at timestamp, and if it is, ensure we are not trying
    // to set it to empty string (this would never make sense.)
    if (value === '' && (correspondingAttrDef.autoCreatedAt || correspondingAttrDef.autoUpdatedAt)) {
      throw flaverr('E_HIGHLY_IRREGULAR', new Error(
        'Cannot set the specified value for attribute `'+supposedAttrName+'`: \'\' (empty string).  '+
        'Depending on this attribute\'s type, it expects to be set to either a JSON timestamp (ISO 8601) '+
        'or JS timestamp (unix epoch ms).'
      ));
    }//-•


    // Validate the provided value vs. the attribute `type`.
    //
    // > Note: This is just like normal RTTC validation ("loose" mode), with one major exception:
    // > We handle `null` as a special case, regardless of the type being validated against;
    // > whether or not this attribute is `required: true`.  That's because it's so easy to
    // > get confused about how `required` works in a given database vs. Waterline vs. JavaScript.
    // > (Especially when it comes to null vs. undefined vs. empty string, etc)
    // >
    // > In RTTC, `null` is only valid vs. `json` and `ref`, and that's still true here.
    // > But in most databases, `null` is also allowed an implicit base value for any type
    // > of data.  This sorta serves the same purpose as `undefined`, or omission, in JavaScript
    // > or MongoDB.  BUT that doesn't mean we necessarily allow `null` -- consistency of type safety
    // > rules is too important -- it just means that we give it its own special error message.
    // >
    // > Review the "required"-ness checks in the `normalize-new-record.js` utility for examples
    // > of related behavior, and see the more detailed spec for more information:
    // > https://docs.google.com/spreadsheets/d/1whV739iW6O9SxRZLCIe2lpvuAUqm-ie7j7tn_Pjir3s/edit#gid=1814738146
    var isProvidingNullForIncompatibleOptionalAttr = (
      _.isNull(value) &&
      correspondingAttrDef.type !== 'json' &&
      correspondingAttrDef.type !== 'ref' &&
      !correspondingAttrDef.required
    );
    if (isProvidingNullForIncompatibleOptionalAttr) {
      throw flaverr('E_INVALID', new Error(
        'Specified value (`null`) is not a valid `'+supposedAttrName+'`.  '+
        'Even though this attribute is optional, it still does not allow `null` to '+
        'be explicitly set, because `null` is not valid vs. the expected '+
        'type: \''+correspondingAttrDef.type+'\'.  Instead, to indicate "voidness", '+
        'please set the value for this attribute to the base value for its type, '+(function _getBaseValuePhrase(){
          switch(correspondingAttrDef.type) {
            case 'string': return '`\'\'` (empty string)';
            case 'number': return '`0` (zero)';
            default: return '`'+rttc.coerce(correspondingAttrDef.type)+'`';
          }
        })()+'.  (Or, if you specifically need to save `null`, then change this '+
        'attribute to either `type: \'json\'` or `type: ref`.)  '+(function _getExtraPhrase(){
          if (_.isUndefined(correspondingAttrDef.defaultsTo)) {
            return 'Also note: Since this attribute does not define a `defaultsTo`, '+
            'the base value will be used as an implicit default if `'+supposedAttrName+'` '+
            'is omitted when creating a record.';
          }
          else { return ''; }
        })()
      ));
    }//-•


    //  ┌─┐┬ ┬┌─┐┬─┐┌─┐┌┐┌┌┬┐┌─┐┌─┐  ╔╦╗╦ ╦╔═╗╔═╗  ╔═╗╔═╗╔═╗╔═╗╔╦╗╦ ╦
    //  │ ┬│ │├─┤├┬┘├─┤│││ │ ├┤ ├┤    ║ ╚╦╝╠═╝║╣   ╚═╗╠═╣╠╣ ║╣  ║ ╚╦╝
    //  └─┘└─┘┴ ┴┴└─┴ ┴┘└┘ ┴ └─┘└─┘   ╩  ╩ ╩  ╚═╝  ╚═╝╩ ╩╚  ╚═╝ ╩  ╩
    // Verify that this value matches the expected type, and potentially perform
    // loose coercion on it at the same time.  This throws an E_INVALID error if
    // validation fails.
    value = rttc.validate(correspondingAttrDef.type, value);


    //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┌─┐┌─┐┬─┐  ╦═╗╦ ╦╦  ╔═╗  ╦  ╦╦╔═╗╦  ╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  │  ├─┤├┤ │  ├┴┐  ├┤ │ │├┬┘  ╠╦╝║ ║║  ║╣   ╚╗╔╝║║ ║║  ╠═╣ ║ ║║ ║║║║╚═╗
    //  └─┘┴ ┴└─┘└─┘┴ ┴  └  └─┘┴└─  ╩╚═╚═╝╩═╝╚═╝   ╚╝ ╩╚═╝╩═╝╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝
    // If appropriate, strictly enforce our (potentially-mildly-coerced) value
    // vs. the validation ruleset defined on the corresponding attribute.
    // Then, if there are any rule violations, stick them in an Error and throw it.
    //
    // > • High-level validation rules are ALWAYS skipped for `null`.
    // > • If there is no `validations` attribute key, then there's nothing for us to do here.
    var ruleset = correspondingAttrDef.validations;
    var doCheckForRuleViolations = !_.isNull(value) && !_.isUndefined(ruleset);
    if (doCheckForRuleViolations) {
      assert(_.isObject(ruleset) && !_.isArray(ruleset) && !_.isFunction(ruleset), 'If set, the `validations` attribute key should always be a dictionary.  But for the `'+modelIdentity+'` model\'s `'+supposedAttrName+'` attribute, it somehow ended up as this instead: '+util.inspect(correspondingAttrDef.validations,{depth:5})+'');

      var ruleViolations;
      try {
        ruleViolations = anchor(value, ruleset);
      } catch (e) {
        throw new Error(
          'Consistency violation: Unexpected error occurred when attempting to apply '+
          'high-level validation rules from attribute `'+supposedAttrName+'`.  '+e.stack
        );
      }//</ catch >

      if (ruleViolations.length > 0) {
        throw flaverr({
          code: 'E_VIOLATES_RULES',
          ruleViolations: ruleViolations
        }, new Error('Internal: Violated one or more validation rules.'));
      }//-•

    }//>-•  </if (doCheckForRuleViolations) >

  }//</else (i.e. corresponding attr def is just a normal attr--not an association or primary key)>


  // Return the normalized value.
  return value;

};
