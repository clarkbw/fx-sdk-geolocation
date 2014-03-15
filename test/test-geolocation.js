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
  Geolocation.getCurrentPosition().then(function success(geo) {
    assert.ok(geo, "Got the position " + geo.latitude + " " + geo.longitude);
    assert.ok(geo.accuracy, "accuracy: " + geo.accuracy);
    assert.notEqual(geo.altitude, null, "altitude: " + geo.altitude);
    assert.notEqual(geo.altitudeAccuracy, null, "altitudeAccuracy: " + geo.altitudeAccuracy);
    // these will fail if you're running this test on a moving phone
    assert.ok(isNaN(geo.heading), "heading: " + geo.heading);
    assert.ok(isNaN(geo.speed), "speed: " + geo.speed);
    if (geo.GEO_API_V1) {
      assert.ok(geo.address, "address: " + geo.address);
    } else {
      assert.equal(geo.address, null, "address: " + geo.address);
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
  Geolocation.watchPosition().then(function success(geo) {
    assert.ok(geo, "Got the position " + geo.latitude + " " + geo.longitude);
    assert.equal(geo.isWatching(), true, "Is currently watching the position");
    geo.allowed = false;
    assert.equal(geo.isWatching(), false, "Is no longer watching the position");
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
