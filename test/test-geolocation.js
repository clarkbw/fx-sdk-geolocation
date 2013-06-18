/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*jshint forin:true, noarg:true, noempty:true, eqeqeq:true, bitwise:true,
  strict:true, undef:true, curly:true, browser:true,
  indent:2, maxerr:50, devel:true, node:true, boss:true, white:true,
  globalstrict:true, nomen:false, newcap:true, esnext:true */

"use strict";

const { Geolocation } = require("geolocation");
const prefs = require('sdk/simple-prefs').prefs;

exports['test 001 is geolocation not allowed by default'] = function (assert) {
  assert.equal(Geolocation.allowed, false, "Geolocation shouldn't be allowed by default");
};

exports['test preference is saved correctly'] = function (assert) {
  Geolocation.allowed = false;
  assert.equal(Geolocation.allowed, prefs['allowGeolocation'], "pref turned off correctly");
  Geolocation.allowed = true;
  assert.equal(Geolocation.allowed, prefs['allowGeolocation'], "pref turned on correctly");
};

exports['test getCurrentPosition'] = function (assert, done) {
  Geolocation.allowed = true;
  Geolocation.getCurrentPosition().then(function success(position) {
    assert.ok(position, "Got the position " + position.coords.latitude + " " + position.coords.longitude);
    assert.ok(Geolocation.accuracy, "accuracy: " + Geolocation.accuracy);
    assert.notEqual(Geolocation.altitude, null, "altitude: " + Geolocation.altitude);
    assert.notEqual(Geolocation.altitudeAccuracy, null, "altitudeAccuracy: " + Geolocation.altitudeAccuracy);
    // these will fail if you're running this test on a moving phone
    assert.ok(isNaN(Geolocation.heading), "heading: " + Geolocation.heading);
    assert.ok(isNaN(Geolocation.speed), "speed: " + Geolocation.speed);
    if (Geolocation.GEO_API_V1) {
      assert.ok(Geolocation.address, "address: " + Geolocation.address);
    } else {
      assert.equal(Geolocation.address, null, "address: " + Geolocation.address);
    }
    done();
  }, function fail(error) {
    assert.fail(error);
  });
  Geolocation.once("coords", function (coords) {
    assert.ok(coords, "Found coordinates " +  coords.latitude + " " + coords.longitude);
  });
  if (Geolocation.GEO_API_V1) {
    Geolocation.once("address", function(address) {
      assert.ok(address, "GEO_API_V1: Found address");
    });    
  }
};

exports['test watchPosition'] = function (assert, done) {
  Geolocation.allowed = true;
  Geolocation.watchPosition().then(function success(position) {
    assert.ok(position, "Got the position " + position.coords.latitude + " " + position.coords.longitude);
    assert.equal(Geolocation.isWatching(), true, "Is currently watching the position");
    Geolocation.allowed = false;
    assert.equal(Geolocation.isWatching(), false, "Is no longer watching the position");
    done();
  }, function fail(error) {
    assert.fail(error);
  });
  Geolocation.once("coords", function (coords) {
    assert.ok(coords, "Received watch position coordinates " +  coords.latitude + " " + coords.longitude);
  });
  if (Geolocation.GEO_API_V1) {
    Geolocation.once("address", function(address) {
      assert.ok(address, "GEO_API_V1: Found address");
    });    
  }
};

require('test').run(exports);
