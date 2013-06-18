/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:false, esnext:true */

"use strict";

const xulapp = require('sdk/system/xul-app');

if (!xulapp.is('Firefox')) {
  throw new Error("The geolocation module is only tested in Firefox.");
}

const { Cc, Ci } = require('chrome'),
      { Class } = require('sdk/core/heritage'),
      { EventTarget } = require('sdk/event/target'),
      { emit } = require('sdk/event/core'),
      { ns } = require('sdk/core/namespace'),
      { merge } = require('sdk/util/object'),
      PrefSvc = require('sdk/preferences/service'),
      { defer } = require('sdk/core/promise');

const namespace = ns();

const GEO_API_V1_VALUES = { 'geo.wifi.protocol' : 0, 'geo.wifi.uri' : 'https://www.google.com/loc/json' };

const ALLOWED_ERROR = { code : 1, message : "You must get permission to use geolocation and set allowed to true" };

/**
 * This object is for working with the internal Firefox GeoLocation Service
 *
 * It will emit events for coordinates however it is not smart about
 * relatively small location changes
 *
 * Here's how you could easily use this Geolocation module:
 *
 * Register for the "coords" event which is emitted when a users coordinates are located
 *
 * @example
 *  Geolocation.once("coords", function(coords) {
 *    console.log("got coords", coords.latitude, coords.longitude);
 *    // or
 *    console.log("got coords", Geolocation.coords.latitude, Geolocation.coords.longitude);
 *  });
 *  Geolocation.getCurrentPosition();
 *
 * Alternatively you could use the promise style return
 *
 * @example
 *  Geolocation.getCurrentPosition().then(function (position) {
 *    console.log("got coords", position.coords.latitude, position.coords.longitude);
 *  });
 *
 * To watch position use a similar 
 *
 * @example
 *  Geolocation.watchPosition().then(function (position) {
 *    console.log("got coords", position.coords.latitude, position.coords.longitude);
 *  });
 *  // this will event everytime the position changes, which can be quite often
 *  Geolocation.on("coords", function(coords) {
 *    console.log("got coords", coords.latitude, coords.longitude);
 *    // or
 *    console.log("got coords", Geolocation.coords.latitude, Geolocation.coords.longitude);
 *  });
 *
 * For older versions of Firefox (4 - 8) you can look for the address.  Current versions
 * of Firefox will require geocoding to get a formatted address
 *
 * @example
 *  Geolocation.once("address", function(address) {
 *    // address is an object of address properties
 *    console.log("got address", address);
 *    // or
 *    console.log("got asddress", Geolocation.address);
 *  });
 *
 *
 * You must set `Geolocation.allowed = true;` to use any of the main Geolocation functions
 *
 * @see https://developer.mozilla.org/en/nsIDOMGeolocation
 * @see https://developer.mozilla.org/en/Using_geolocation
 */
var GeolocationClass = Class({

  ALLOW_GEOLOCATION_PREF : ['extensions', require('sdk/self').id, 'allowGeolocation'].join('.'),

  // newer versions of Firefox use a different API and have the pref hardcoded (bug 677256)
  GEO_API_V1 : xulapp.versionInRange(xulapp.version, "4", "8.*"),

  'extends' : EventTarget,

  initialize: function initialize(options) {
    EventTarget.prototype.initialize.call(this, options);

    var privateAPI = namespace(this);

    // all this work despite the fact that users of this module can't pass in options here
    privateAPI.options = merge({
      enableHighAccuracy  : false,
      timeout             : 15 * 1000
    }, options);

    privateAPI.GeolocationSvc = Cc['@mozilla.org/geolocation;1'].getService(Ci.nsISupports);

    // for older versions of Firefox we must set the correct preferences
    if (this.GEO_API_V1) {
      Object.keys(GEO_API_V1_VALUES).forEach(function (key) {
        if (!PrefSvc.isSet(key)) {
          PrefSvc.set(key, GEO_API_V1_VALUES[key]);
        }
      });
    }

    // An unsigned short returned from the watchPosition function is saved here
    // @see https://developer.mozilla.org/en/nsIDOMGeolocation#method_watchPosition
    privateAPI.watchID = null;
    // a local position variable
    privateAPI.position = null;

    privateAPI.allowed = PrefSvc.get(this.ALLOW_GEOLOCATION_PREF, false);

    require('sdk/system/unload').ensure(this);
  },

  /** 
   * Defaults to false
   * Getter/Setter for the enableHighAccuracy option of the {nsIDOMGeoPositionOptions}
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  get enableHighAccuracy() { return namespace(this).options.enableHighAccuracy; },
  set enableHighAccuracy(enableHighAccuracy) {
    namespace(this).options.enableHighAccuracy = enableHighAccuracy;
  },

  /**
   * Getter/Setter for the timeout option of the {nsIDOMGeoPositionOptions}
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionOptions
   */
  get timeout() { return namespace(this).options.timeout; },
  set timeout(timeout) {
    namespace(this).options.timeout = timeout;
  },

  /**
   * @returns {nsIDOMGeoPosition} The most recently retrieved location. May be null
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation
   * @type nsIDOMGeoPosition
   */
  get lastPosition() { return namespace(this).GeolocationSvc.lastPosition; },

  /**
   * @returns {nsIDOMGeoPosition} The most recently retrieved location. May be null
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   * @type nsIDOMGeoPosition
   */
  get position() { return namespace(this).position; },


  /**
   * Timestamp of the last reading for the position
   * @type DOMTimeStamp
   */
  get timestamp() { return (this.position) ? this.position.timestamp : null; },

  /**
   * Most recently retrieved coordinates
   * @type nsIDOMGeoPositionCoords
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDOMGeoPositionCoords
   */
  get coords() { return (this.position) ? this.position.coords : null; },

  /*
   * Helper function for most recently retrieved latitude
   * @type String
   * @returns latitude or empty string
   */
  get latitude() { return (this.coords) ? this.coords.latitude : ""; },

  /**
   * Helper function for most recently retrieved longitude
   * @type String
   * @returns longitude or empty string
   */
  get longitude() { return (this.coords) ? this.coords.longitude : ""; },

  /**
   * Helper function for the accuracy of the lat/long expressed in meters
   * @type Number
   * @returns accuracy or null
   */
  get accuracy() { return (this.coords) ? this.coords.accuracy : null; },

  /**
   * Helper function for most recently retrieved altitude
   * @type Number
   * @returns altitude or null
   */
  get altitude() { return (this.coords) ? this.coords.altitude : null; },

  /**
   * Helper function for the accuracy of the altitude expressed in meters
   * @type Number
   * @returns altitudeAccuracy or null
   */
  get altitudeAccuracy() { return (this.coords) ? this.coords.altitudeAccuracy : null; },

  /**
   * A number representing the direction in which the device is traveling. 
   * This value, specified in degrees, indicates how far off from heading due north the device is. 
   * 0 degrees represents true true north, and the direction is determined clockwise 
   * (which means that east is 90 degrees and west is 270 degrees). 
   * If speed is 0, heading is NaN. If the device is not able to provide heading information, this value is null.
   * @type Number
   * @returns heading or null
   */
  get heading() { return (this.coords) ? this.coords.heading : null; },

  /**
   * Helper function for the velocity of the device in meters per second
   * @type Number
   * @returns altitudeAccuracy or null
   */
  get speed() { return (this.coords) ? this.coords.speed : null; },

  /**
   * Most recently retrieved address from the V1 GEO API
   * @type nsIDOMGeoPositionAddress
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIDOMGeoPositionAddress
   */
  get address() { return (this.position.address)? this.position.address : null; },

  /**
   * It's the callers responsibility to actually put this question up to the user
   * Once this is set location is automatically aquired by the system
   */
  get allowed() { return namespace(this).allowed; },
  set allowed(allow) {
    namespace(this).allowed = allow;
    PrefSvc.set(this.ALLOW_GEOLOCATION_PREF, allow);
    // in case we are no longer allowed to use geolocation we need to stop watching
    if (!allow) {
      this.stopWatching();
    }
  },

  getCurrentPosition : function getCurrentPosition() {
    var privateAPI = namespace(this);
    var deferred = defer();
    if (this.allowed) {
      privateAPI.GeolocationSvc.getCurrentPosition(function success(position) {
        this._setposition(position);
        deferred.resolve(position);
      }.bind(this),
      function fail(positionError) {
        this._onerror(positionError);
        deferred.reject(positionError);
      }.bind(this),
      privateAPI.options);
    } else {
      this._onerror(ALLOWED_ERROR);
      deferred.reject(ALLOWED_ERROR);
    }
    return deferred.promise;
  },

  /**
   * Calls clearWatch() to stop position watching in the geolocation service
   */
  stopWatching : function stopWatching() {
    if (this.isWatching()) {
      namespace(this).GeolocationSvc.clearWatch(namespace(this).watchID);
      namespace(this).watchID = null;
    }
  },

  /**
   * Returns true if the watchPosition `watchID` is in use
   */
  isWatching : function isWatching() {
    return namespace(this).watchID !== null;
  },

  /**
   * Sets a position watch, this can be run as the allowed preference changes
   * and it will stop or start monitoring wrt the the allowed preference
   * @see https://developer.mozilla.org/en/nsIDOMGeolocation#method_watchPosition
   */
  // 
  watchPosition : function watchPosition() {
    var privateAPI = namespace(this);
    var deferred = defer();

    if (this.allowed) { 
      if (!this.isWatching()) {
        try {
          privateAPI.watchID = privateAPI.GeolocationSvc.watchPosition(function success(position) {
            this._setposition(position);
            deferred.resolve(position);
          }.bind(this),
          function fail(positionError) {
            this._onerror(positionError);
            deferred.reject(positionError);
          }.bind(this),
          privateAPI.options);
        } catch (exception) { 
          deferred.reject(exception);
        }
      } else {
        deferred.resolve(this.position);
      }
    } else {
      this.stopWatching();
      this._onerror(ALLOWED_ERROR);
      deferred.reject(ALLOWED_ERROR);
    }
    return deferred.promise;
  },

  /*
   * Provides the nsIDOMGeoPositionCallback function for watchPosition and getCurrentPosition
   * Called every time a new position is found, even if it's not different
   * however it will not emit new events if the position is the same.  Practically speaking the
   * position is different everytime just because of the way geolocation works.
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionCallback
   * @param {nsIDOMGeoPosition} position The GeoPosition object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPosition
   */
  _setposition : function _setposition(position) {
    if (position != namespace(this).position) {
      namespace(this).position = position;

      // emit the minimal coordinates if that's what callers are looking for
      emit(this, "coords", this.coords);

      // the older (better) API gave us the address with the coordinates
      if (this.GEO_API_V1) {
        // no reason to save this, but why not?
        namespace(this).address = position.address;
        // emit an address lookup
        emit(this, "address", this.address);
      }      
    }
  },

  /**
   * Provides the nsIDOMGeoPositionErrorCallback function for watchPosition and getCurrentPosition
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionErrorCallback
   * @param {nsIDOMGeoPositionError} e GeoPosition Error object
   * @see https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionError
   */
  _onerror : function onerror(e) {
    if (e.code === e.PERMISSION_DENIED) {
      emit(this, "error", "permission-denied");
    } else if (e.code === e.POSITION_UNAVAILABLE) {
      emit(this, "error", "position-unavailable");
    } else if (e.code === e.TIMEOUT) {
      emit(this, "error", "timeout", this.timeout);      
    }
  },


  unload: function geolocation_unload(reason) {
    this.stopWatching();

    // disable is the new uninstall
    if (reason === "disable") {
      this.allowed = false;
    }
  }

});

exports.Geolocation = new GeolocationClass();
